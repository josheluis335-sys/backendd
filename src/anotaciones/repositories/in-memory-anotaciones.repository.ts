import { Inject, Injectable, Optional } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../../tickets/tickets.constants.js';
import type { Anotacion } from '../entities/anotacion.entity.js';
import type { AnotacionesRepository } from '../interfaces/anotaciones.repository.interface.js';

@Injectable()
export class InMemoryAnotacionesRepository implements AnotacionesRepository {
  private readonly anotaciones = new Map<string, Anotacion[]>();

  constructor(
    @Optional()
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork = new TicketActionUnitOfWork(),
  ) {}

  async agregar(anotacion: Anotacion): Promise<void> {
    const stored = structuredClone(anotacion);
    const previous = this.anotaciones.get(stored.ticketId) ?? [];
    await this.unitOfWork.stage(
      () => {
        this.anotaciones.set(stored.ticketId, [...previous, stored]);
      },
      () => {
        if (previous.length === 0) this.anotaciones.delete(stored.ticketId);
        else this.anotaciones.set(stored.ticketId, previous);
      },
    );
  }

  async listarPorTicket(ticketId: string): Promise<Anotacion[]> {
    return structuredClone(this.anotaciones.get(ticketId) ?? []);
  }
}
