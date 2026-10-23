import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ClockService } from '../common/clock/clock.service.js';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK, TICKETS_REPOSITORY } from '../tickets/tickets.constants.js';
import type { TicketsRepository } from '../tickets/interfaces/tickets.repository.interface.js';
import { TicketStatus } from '../tickets/entities/ticket.entity.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { TicketVisibilityPolicy } from '../tickets/policy/ticket-visibility.policy.js';
import { USUARIOS_REPOSITORY } from '../usuarios/usuarios.constants.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { ANOTACIONES_REPOSITORY } from './anotaciones.constants.js';
import type { Anotacion } from './entities/anotacion.entity.js';
import type { AnotacionesRepository } from './interfaces/anotaciones.repository.interface.js';
import type { ListAnotacionesDto } from './dto/list-anotaciones.dto.js';

export interface AnotacionResponseDto extends Anotacion {
  autor: { id: string; nombre: string };
}

@Injectable()
export class AnotacionesService {
  private readonly logger = new Logger(AnotacionesService.name);

  constructor(
    @Inject(ANOTACIONES_REPOSITORY)
    private readonly repository: AnotacionesRepository,
    @Inject(TICKETS_REPOSITORY)
    private readonly ticketsRepository: TicketsRepository,
    @Inject(USUARIOS_REPOSITORY)
    private readonly usuariosRepository: UsuariosRepository,
    private readonly visibility: TicketVisibilityPolicy,
    private readonly clock: ClockService,
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork: TicketActionUnitOfWork,
    private readonly config: ConfigService,
  ) {}

  async create(ticketId: string, texto: string, actor: TicketActor): Promise<Anotacion> {
    if (actor.rol !== UserRole.AGENTE) {
      throw new ForbiddenException('Solo un agente puede agregar anotaciones.');
    }
    const anotacion: Anotacion = {
      id: randomUUID(),
      ticketId,
      autorId: actor.id,
      texto: texto.trim(),
      fecha: this.clock.ahora().toISOString(),
    };
    const created = await this.unitOfWork.execute(async () => {
      await this.requireWritableTicket(ticketId, actor);
      const existing = await this.repository.listarPorTicket(ticketId);
      const maximum = this.config.get<number>('ANOTACIONES_MAX_POR_TICKET', 200);
      if (existing.length >= maximum) {
        throw new ConflictException(`El ticket alcanzó el límite de ${maximum} anotaciones.`);
      }
      await this.unitOfWork.stage(async () => {
        await this.requireWritableTicket(ticketId, actor);
      });
      await this.repository.agregar(anotacion);
      return structuredClone(anotacion);
    });
    this.logger.log(`Anotación agregada. Usuario: ${actor.id}`);
    return created;
  }

  async list(
    ticketId: string,
    actor: TicketActor,
    pagination: ListAnotacionesDto,
  ): Promise<{ data: AnotacionResponseDto[]; page: number; pageSize: number; total: number }> {
    await this.requireVisibleTicket(ticketId, actor);
    const annotations = (await this.repository.listarPorTicket(ticketId)).sort(
      (left, right) => left.fecha.localeCompare(right.fecha),
    );
    const offset = (pagination.page - 1) * pagination.pageSize;
    const pageItems = annotations.slice(offset, offset + pagination.pageSize);
    const data = await Promise.all(
      pageItems.map(async (item) => {
        const user = await this.usuariosRepository.findById(item.autorId);
        return {
          ...item,
          autor: { id: item.autorId, nombre: user?.nombre ?? 'Usuario desconocido' },
        };
      }),
    );
    return {
      data,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: annotations.length,
    };
  }

  private async requireVisibleTicket(ticketId: string, actor: TicketActor) {
    const ticket = await this.ticketsRepository.findById(ticketId);
    if (!ticket || !(await this.visibility.canSee(actor, ticket))) {
      throw new NotFoundException('No se encontró el ticket solicitado.');
    }
    return ticket;
  }

  private async requireWritableTicket(ticketId: string, actor: TicketActor) {
    const ticket = await this.requireVisibleTicket(ticketId, actor);
    if (ticket.estado === TicketStatus.CERRADO) {
      throw new ConflictException('No se pueden agregar anotaciones a un ticket cerrado.');
    }
    return ticket;
  }
}
