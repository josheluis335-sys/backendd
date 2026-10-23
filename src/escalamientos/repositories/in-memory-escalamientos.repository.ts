import { Inject, Injectable, Optional } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../../tickets/tickets.constants.js';
import type { Escalamiento } from '../entities/escalamiento.entity.js';
import type { EscalamientosRepository } from '../interfaces/escalamientos.repository.interface.js';

@Injectable()
export class InMemoryEscalamientosRepository implements EscalamientosRepository {
  private readonly escalamientos = new Map<string, Escalamiento[]>();

  constructor(
    @Optional()
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork = new TicketActionUnitOfWork(),
  ) {}

  async agregar(escalamiento: Escalamiento): Promise<void> {
    const stored = structuredClone(escalamiento);
    const records = this.escalamientos.get(stored.ticketId) ?? [];
    await this.unitOfWork.stage(
      () => {
        this.escalamientos.set(stored.ticketId, [...records, stored]);
      },
      () => {
        if (records.length === 0) this.escalamientos.delete(stored.ticketId);
        else this.escalamientos.set(stored.ticketId, records);
      },
    );
  }

  async listarPorTicket(ticketId: string): Promise<Escalamiento[]> {
    return structuredClone(this.escalamientos.get(ticketId) ?? []);
  }

  async listarPorTickets(ticketIds: readonly string[]): Promise<Map<string, Escalamiento[]>> {
    return new Map(
      ticketIds.map((ticketId) => [
        ticketId,
        structuredClone(this.escalamientos.get(ticketId) ?? []),
      ]),
    );
  }
}
