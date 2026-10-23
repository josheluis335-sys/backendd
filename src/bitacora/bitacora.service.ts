import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { USUARIOS_REPOSITORY } from '../usuarios/usuarios.constants.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';
import { TICKETS_REPOSITORY } from '../tickets/tickets.constants.js';
import type { TicketsRepository } from '../tickets/interfaces/tickets.repository.interface.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { TicketVisibilityPolicy } from '../tickets/policy/ticket-visibility.policy.js';
import { BITACORA_REPOSITORY } from './bitacora.constants.js';
import type {
  DetalleBitacora,
  EventoBitacoraTipo,
} from './entities/evento-bitacora.entity.js';
import type { BitacoraRepository } from './interfaces/bitacora.repository.interface.js';
import { ListBitacoraDto } from './dto/list-bitacora.dto.js';
import { ClockService } from '../common/clock/clock.service.js';

export interface BitacoraListItem {
  evento: {
    id: string;
    ticketId: string;
    tipo: EventoBitacoraTipo;
    detalle: DetalleBitacora;
    usuarioId?: string;
    fecha: string;
  };
  fecha: string;
  hora: string;
  usuarioNombre: string | null;
}

export interface PaginatedBitacoraResponse {
  data: BitacoraListItem[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class BitacoraService {
  constructor(
    @Inject(BITACORA_REPOSITORY)
    private readonly bitacoraRepository: BitacoraRepository,
    @Inject(TICKETS_REPOSITORY)
    private readonly ticketsRepository: TicketsRepository,
    @Inject(USUARIOS_REPOSITORY)
    private readonly usuariosRepository: UsuariosRepository,
    private readonly visibilityPolicy: TicketVisibilityPolicy,
    private readonly clock: ClockService,
  ) {}

  async registrar(
    ticketId: string,
    tipo: EventoBitacoraTipo,
    detalle: DetalleBitacora,
    usuarioId?: string,
  ): Promise<void> {
    await this.bitacoraRepository.agregar({
      id: randomUUID(),
      ticketId,
      tipo,
      detalle: structuredClone(detalle),
      ...(usuarioId === undefined ? {} : { usuarioId }),
      fecha: this.clock.ahora().toISOString(),
    });
  }

  async listarVisiblePorTicket(
    ticketId: string,
    actor: TicketActor,
    pagination: ListBitacoraDto,
  ): Promise<PaginatedBitacoraResponse> {
    const ticket = await this.ticketsRepository.findById(ticketId);
    if (!ticket || !(await this.visibilityPolicy.canSee(actor, ticket))) {
      throw new NotFoundException('No se encontró el ticket solicitado.');
    }
    const events = (await this.bitacoraRepository.listarPorTicket(ticketId)).sort(
      (left, right) => left.fecha.localeCompare(right.fecha),
    );
    const start = (pagination.page - 1) * pagination.pageSize;
    const pageEvents = events.slice(start, start + pagination.pageSize);
    const data = await Promise.all(
      pageEvents.map(async (evento) => {
        const user = evento.usuarioId
          ? await this.usuariosRepository.findById(evento.usuarioId)
          : null;
        return {
          evento,
          fecha: evento.fecha.slice(0, 10),
          hora: evento.fecha.slice(11, 19),
          usuarioNombre: user?.nombre ?? null,
        };
      }),
    );
    return { data, page: pagination.page, pageSize: pagination.pageSize, total: events.length };
  }
}
