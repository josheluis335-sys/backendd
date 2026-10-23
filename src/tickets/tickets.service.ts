import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AreasService } from '../areas/areas.service.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { EventoBitacoraTipo } from '../bitacora/entities/evento-bitacora.entity.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { CategoriasService } from '../categorias/categorias.service.js';
import { TicketCounterService } from './counter/ticket-counter.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsDto } from './dto/list-tickets.dto.js';
import {
  Ticket,
  TicketStatus,
} from './entities/ticket.entity.js';
import { TICKETS_REPOSITORY } from './tickets.constants.js';
import type { TicketsRepository } from './interfaces/tickets.repository.interface.js';
import { TicketVersionConflictError } from './interfaces/tickets.repository.interface.js';
import { TicketVisibilityPolicy } from './policy/ticket-visibility.policy.js';
import type { TicketActor } from './policy/ticket-visibility.policy.js';
import { ClockService } from '../common/clock/clock.service.js';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from './tickets.constants.js';
import { EscalamientosService } from '../escalamientos/escalamientos.service.js';
import { EscalarTicketDto } from '../escalamientos/dto/escalar-ticket.dto.js';
import { CloseTicketDto, PauseTicketDto } from './dto/ticket-actions.dto.js';
import {
  TicketAction,
  TicketMachineStatus,
  transitionTicketState,
} from './state/ticket-state-machine.js';
import { SlaService } from '../sla/sla.service.js';
import { toSupportTicketResponse } from './dto/ticket-response.dto.js';
import type { SupportTicketResponseDto } from './dto/ticket-response.dto.js';
import type { ListSupervisorTicketsDto } from './dto/list-supervisor-tickets.dto.js';
import type { EscalamientoDto } from '../escalamientos/escalamientos.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import {
  ticketWithoutVersion,
  type TicketActionResponseDto,
} from './dto/ticket-action-response.dto.js';

export interface PaginatedTicketsResponse {
  data: SupportTicketResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupervisorTicketResponseDto extends SupportTicketResponseDto {
  escalamientos: EscalamientoDto[];
}

export interface PaginatedSupervisorTicketsResponse {
  data: SupervisorTicketResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class TicketsService {
  constructor(
    @Inject(TICKETS_REPOSITORY)
    private readonly ticketsRepository: TicketsRepository,
    private readonly counter: TicketCounterService,
    private readonly categoriasService: CategoriasService,
    private readonly areasService: AreasService,
    private readonly bitacoraService: BitacoraService,
    private readonly visibilityPolicy: TicketVisibilityPolicy,
    private readonly clock: ClockService,
    private readonly escalamientosService: EscalamientosService,
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork: TicketActionUnitOfWork,
    private readonly slaService: SlaService,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  async create(
    dto: CreateTicketDto,
    actor: TicketActor,
  ): Promise<TicketActionResponseDto> {
    return this.createWithCommit(dto, actor, async () => undefined);
  }

  async createFromCommunication(
    dto: CreateTicketDto,
    actor: TicketActor,
    commitConversion: (ticket: Ticket) => Promise<void>,
  ): Promise<TicketActionResponseDto> {
    return this.createWithCommit(dto, actor, commitConversion);
  }

  private async createWithCommit(
    dto: CreateTicketDto,
    actor: TicketActor,
    commitConversion: (ticket: Ticket) => Promise<void>,
  ): Promise<TicketActionResponseDto> {
    if (actor.rol !== UserRole.AGENTE) {
      throw new ConflictException('Solo un agente puede crear tickets.');
    }
    const category = await this.categoriasService.findById(dto.categoriaId);
    if (!category.activa) {
      throw new ConflictException('No se puede crear un ticket con una categoría inactiva.');
    }
    if (!actor.areaId) {
      throw new ConflictException('El agente no tiene un área asignada.');
    }
    const area = await this.areasService.findById(actor.areaId);
    if (!area.activa) {
      throw new ConflictException('El área actual del agente debe estar activa.');
    }

    const now = this.clock.ahora();
    const consecutivo = this.counter.next(dto.tipo);
    const ticket: Ticket = {
      id: randomUUID(),
      version: 1,
      tipo: dto.tipo,
      consecutivo,
      numero: this.counter.format(dto.tipo, consecutivo),
      titulo: dto.titulo.trim(),
      descripcion: dto.descripcion.trim(),
      categoriaId: category.id,
      prioridad: dto.prioridad,
      canal: dto.canal,
      solicitanteNombre: dto.solicitanteNombre.trim(),
      solicitanteCorreo: dto.solicitanteCorreo.trim().toLowerCase(),
      estado: TicketStatus.NUEVO,
      areaActualId: area.id,
      creadoPorId: actor.id,
      fechaCreacion: now,
      fechaUltimaActualizacion: now,
      tiempoPausaAcumuladoSeg: 0,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
      solucion: null,
      fechaCierre: null,
    };
    const created = await this.unitOfWork.execute(async () => {
      const created = await this.ticketsRepository.create(ticket);
      await this.bitacoraService.registrar(
        created.id,
        EventoBitacoraTipo.CREACION,
        { numero: created.numero },
        actor.id,
      );
      await commitConversion(created);
      return created;
    });
    const notificacion = await this.notificacionesService.notificar(
      created,
      'CREACION',
      actor,
    );
    return { ...ticketWithoutVersion(created), notificacion };
  }

  async escalate(
    id: string,
    dto: EscalarTicketDto,
    actor: TicketActor,
  ): Promise<TicketActionResponseDto> {
    const escalated = await this.runAction(id, actor, async (current) => {
      this.requireActorRole(actor, [UserRole.AGENTE]);
      const nextStatus = transitionTicketState(
        current.estado as TicketMachineStatus,
        TicketAction.ESCALAR,
      );
      await this.escalamientosService.validarDestino(dto.areaId, dto.recibidoPorId);
      if (dto.areaId === current.areaActualId && !dto.recibidoPorId) {
        throw new ConflictException(
          'Para reasignar dentro de la misma área debes indicar un usuario receptor.',
        );
      }
      const updated: Ticket = {
        ...current,
        areaActualId: dto.areaId,
        estado: nextStatus as TicketStatus,
        fechaUltimaActualizacion: this.clock.ahora(),
      };
      await this.bitacoraService.registrar(
        current.id,
        EventoBitacoraTipo.ESCALAMIENTO,
        {
          areaId: dto.areaId,
          recibidoPorId: dto.recibidoPorId ?? null,
        },
        actor.id,
      );
      await this.escalamientosService.registrar(
        id,
        dto.areaId,
        actor.id,
        dto.comentario,
        dto.recibidoPorId,
      );
      return this.updateOptimistically(updated, current.version);
    });
    const notificacion = await this.notificacionesService.notificar(
      escalated,
      'ESCALAMIENTO',
      actor,
    );
    return { ...ticketWithoutVersion(escalated), notificacion };
  }

  async pause(
    id: string,
    dto: PauseTicketDto,
    actor: TicketActor,
  ): Promise<Omit<Ticket, 'version'>> {
    const paused = await this.runAction(id, actor, async (current) => {
      this.requireActorRole(actor, [UserRole.AGENTE]);
      const previous = current.estado as TicketMachineStatus;
      const nextStatus = transitionTicketState(previous, TicketAction.PAUSAR);
      const now = this.clock.ahora();
      const updated: Ticket = {
        ...current,
        estado: nextStatus as TicketStatus,
        estadoAntesDePausa: previous as Ticket['estadoAntesDePausa'],
        pausaInicio: now,
        motivoPausa: dto.motivo.trim(),
        fechaUltimaActualizacion: now,
      };
      await this.bitacoraService.registrar(
        id,
        EventoBitacoraTipo.PAUSA,
        {},
        actor.id,
      );
      return this.updateOptimistically(updated, current.version);
    });
    return ticketWithoutVersion(paused);
  }

  async resume(id: string, actor: TicketActor): Promise<Omit<Ticket, 'version'>> {
    const resumed = await this.runAction(id, actor, async (current) => {
      this.requireActorRole(actor, [UserRole.AGENTE]);
      const nextStatus = transitionTicketState(
        current.estado as TicketMachineStatus,
        TicketAction.REANUDAR,
        current.estadoAntesDePausa as TicketMachineStatus | undefined,
      );
      if (!current.pausaInicio) {
        throw new ConflictException('El ticket en pausa no tiene fecha de inicio registrada.');
      }
      const now = this.clock.ahora();
      const pauseSeconds = Math.max(
        0,
        Math.floor((now.getTime() - current.pausaInicio.getTime()) / 1000),
      );
      const totalSeconds = current.tiempoPausaAcumuladoSeg + pauseSeconds;
      const businessPauseSeconds = this.slaService.calcularSegundosHabiles(
        current.pausaInicio,
        now,
      );
      const updated: Ticket = {
        ...current,
        estado: nextStatus as TicketStatus,
        tiempoPausaAcumuladoSeg: totalSeconds,
        tiempoPausaHabilAcumuladoSeg:
          current.tiempoPausaHabilAcumuladoSeg + businessPauseSeconds,
        pausaInicio: null,
        estadoAntesDePausa: null,
        motivoPausa: null,
        fechaUltimaActualizacion: now,
      };
      await this.bitacoraService.registrar(
        id,
        EventoBitacoraTipo.REANUDACION,
        {
          segundosPausa: pauseSeconds,
          tiempoPausaAcumuladoSeg: totalSeconds,
          segundosPausaHabil: businessPauseSeconds,
          tiempoPausaHabilAcumuladoSeg:
            current.tiempoPausaHabilAcumuladoSeg + businessPauseSeconds,
        },
        actor.id,
      );
      return this.updateOptimistically(updated, current.version);
    });
    return ticketWithoutVersion(resumed);
  }

  async close(
    id: string,
    dto: CloseTicketDto,
    actor: TicketActor,
  ): Promise<TicketActionResponseDto> {
    const closed = await this.runAction(id, actor, async (current) => {
      this.requireActorRole(actor, [UserRole.AGENTE, UserRole.SUPERVISOR]);
      if (
        actor.rol === UserRole.SUPERVISOR &&
        actor.areaId !== current.areaActualId
      ) {
        throw new NotFoundException('No se encontró el ticket solicitado.');
      }
      const nextStatus = transitionTicketState(
        current.estado as TicketMachineStatus,
        TicketAction.CERRAR,
      );
      const now = this.clock.ahora();
      const updated: Ticket = {
        ...current,
        estado: nextStatus as TicketStatus,
        solucion: dto.solucion.trim(),
        fechaCierre: now,
        fechaUltimaActualizacion: now,
      };
      await this.bitacoraService.registrar(
        id,
        EventoBitacoraTipo.CIERRE,
        {},
        actor.id,
      );
      return this.updateOptimistically(updated, current.version);
    });
    const notificacion = await this.notificacionesService.notificar(
      closed,
      'CIERRE',
      actor,
    );
    return { ...ticketWithoutVersion(closed), notificacion };
  }

  async list(
    filters: ListTicketsDto,
    actor: TicketActor,
  ): Promise<PaginatedTicketsResponse> {
    const allTickets = await this.ticketsRepository.findAll();
    const visibility = await Promise.all(
      allTickets.map((ticket) => this.visibilityPolicy.canSee(actor, ticket)),
    );
    const visible = allTickets
      .filter((_, index) => visibility[index])
      .filter((ticket) => filters.estado === undefined || ticket.estado === filters.estado)
      .filter((ticket) => filters.tipo === undefined || ticket.tipo === filters.tipo)
      .filter(
        (ticket) => filters.prioridad === undefined || ticket.prioridad === filters.prioridad,
      )
      .filter((ticket) => filters.areaId === undefined || ticket.areaActualId === filters.areaId)
      .filter(
        (ticket) => filters.categoriaId === undefined || ticket.categoriaId === filters.categoriaId,
      )
      .filter((ticket) => filters.numero === undefined || ticket.numero === filters.numero)
      .sort(
        (left, right) =>
          right.fechaCreacion.getTime() - left.fechaCreacion.getTime(),
      );
    const withSla = visible
      .map((ticket) => ({ ticket, sla: this.slaService.calcular(ticket) }))
      .filter(({ sla }) => filters.slaEstado === undefined || sla.estado === filters.slaEstado);
    const start = (filters.page - 1) * filters.pageSize;
    return {
      data: withSla
        .slice(start, start + filters.pageSize)
        .map(({ ticket, sla }) => toSupportTicketResponse(ticket, sla)),
      page: filters.page,
      pageSize: filters.pageSize,
      total: withSla.length,
    };
  }

  async findVisibleById(id: string, actor: TicketActor): Promise<Ticket> {
    const ticket = await this.ticketsRepository.findById(id);
    if (!ticket || !(await this.visibilityPolicy.canSee(actor, ticket))) {
      throw new NotFoundException('No se encontró el ticket solicitado.');
    }
    return ticket;
  }

  async findVisibleWithSla(id: string, actor: TicketActor): Promise<SupportTicketResponseDto> {
    const ticket = await this.findVisibleById(id, actor);
    return toSupportTicketResponse(ticket, this.slaService.calcular(ticket));
  }

  async listForSupervisor(
    filters: ListSupervisorTicketsDto,
    actor: TicketActor,
  ): Promise<PaginatedSupervisorTicketsResponse> {
    const page = await this.list(
      {
        estado: filters.estado,
        tipo: filters.tipo,
        prioridad: filters.prioridad,
        slaEstado: filters.slaEstado,
        page: filters.page,
        pageSize: filters.pageSize,
      },
      actor,
    );
    const histories = await this.escalamientosService.listarPorTickets(
      page.data.map((ticket) => ticket.id),
    );
    return {
      ...page,
      data: page.data.map((ticket) => ({
        ...ticket,
        escalamientos: histories.get(ticket.id) ?? [],
      })),
    };
  }

  private requireActorRole(actor: TicketActor, allowed: UserRole[]): void {
    if (!allowed.includes(actor.rol)) {
      throw new ConflictException('El rol no puede ejecutar esta acción.');
    }
  }

  private async updateOptimistically(
    ticket: Ticket,
    expectedVersion: number,
  ): Promise<Ticket> {
    try {
      return await this.ticketsRepository.actualizar(ticket, expectedVersion);
    } catch (error) {
      if (error instanceof TicketVersionConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async runAction(
    id: string,
    actor: TicketActor,
    operation: (current: Ticket) => Promise<Ticket>,
  ): Promise<Ticket> {
    const snapshot = await this.findVisibleById(id, actor);
    try {
      return await this.unitOfWork.execute(async () => {
        const current = await this.findVisibleById(id, actor);
        if (current.version !== snapshot.version) {
          throw new ConflictException(
            'El ticket fue modificado por otra operación. Vuelve a cargarlo e inténtalo de nuevo.',
          );
        }
        return operation(current);
      });
    } catch (error) {
      if (error instanceof TicketVersionConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
