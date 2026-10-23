import { Inject, Injectable, Optional } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../../tickets/tickets.constants.js';
import type { EventoBitacora } from '../entities/evento-bitacora.entity.js';
import type { BitacoraRepository } from '../interfaces/bitacora.repository.interface.js';

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}

@Injectable()
export class InMemoryBitacoraRepository implements BitacoraRepository {
  private readonly eventos = new Map<string, EventoBitacora[]>();

  constructor(
    @Optional()
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork = new TicketActionUnitOfWork(),
  ) {}

  async agregar(evento: EventoBitacora): Promise<void> {
    const stored = freezeDeep(structuredClone(evento));
    const events = this.eventos.get(evento.ticketId) ?? [];
    await this.unitOfWork.stage(
      () => {
        this.eventos.set(evento.ticketId, [...events, stored]);
      },
      () => {
        if (events.length === 0) this.eventos.delete(evento.ticketId);
        else this.eventos.set(evento.ticketId, events);
      },
    );
  }

  async listarPorTicket(ticketId: string): Promise<EventoBitacora[]> {
    return structuredClone(this.eventos.get(ticketId) ?? []);
  }
}
