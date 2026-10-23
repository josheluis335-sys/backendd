import { Inject, Injectable, Optional } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../tickets.constants.js';
import type { Ticket } from '../entities/ticket.entity.js';
import type { TicketsRepository } from '../interfaces/tickets.repository.interface.js';
import { TicketVersionConflictError } from '../interfaces/tickets.repository.interface.js';

@Injectable()
export class InMemoryTicketsRepository implements TicketsRepository {
  private readonly tickets = new Map<string, Ticket>();

  constructor(
    @Optional()
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork = new TicketActionUnitOfWork(),
  ) {}

  async create(ticket: Ticket): Promise<Ticket> {
    const stored = structuredClone(ticket);
    await this.unitOfWork.stage(
      () => {
        if (this.tickets.has(stored.id)) {
          throw new Error('Ya existe un ticket con ese identificador.');
        }
        this.tickets.set(stored.id, stored);
      },
      () => {
        this.tickets.delete(stored.id);
      },
    );
    return structuredClone(stored);
  }

  async findById(id: string): Promise<Ticket | null> {
    const ticket = this.tickets.get(id);
    return ticket ? structuredClone(ticket) : null;
  }

  async findAll(): Promise<Ticket[]> {
    return Array.from(this.tickets.values(), (ticket) => structuredClone(ticket));
  }

  async actualizar(ticket: Ticket, versionEsperada: number): Promise<Ticket> {
    const current = this.tickets.get(ticket.id);
    if (!current || current.version !== versionEsperada) {
      throw new TicketVersionConflictError(
        'El ticket fue modificado por otra operación. Vuelve a cargarlo e inténtalo de nuevo.',
      );
    }
    const updated = structuredClone({ ...ticket, version: versionEsperada + 1 });
    await this.unitOfWork.stage(
      () => {
        const latest = this.tickets.get(updated.id);
        if (!latest || latest.version !== versionEsperada) {
          throw new TicketVersionConflictError(
            'El ticket fue modificado por otra operación. Vuelve a cargarlo e inténtalo de nuevo.',
          );
        }
        this.tickets.set(updated.id, updated);
      },
      () => {
        this.tickets.set(ticket.id, structuredClone(current));
      },
    );
    return structuredClone(updated);
  }
}
