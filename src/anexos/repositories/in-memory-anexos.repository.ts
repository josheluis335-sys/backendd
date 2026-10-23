import { Inject, Injectable } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../../tickets/tickets.constants.js';
import type { Anexo } from '../entities/anexo.entity.js';
import type { AnexosRepository } from '../interfaces/anexos.repository.interface.js';

@Injectable()
export class InMemoryAnexosRepository implements AnexosRepository {
  private readonly anexos = new Map<string, Anexo[]>();

  constructor(
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork: TicketActionUnitOfWork,
  ) {}

  async agregar(anexo: Anexo): Promise<void> {
    const stored = structuredClone(anexo);
    let previous: Anexo[] | undefined;
    await this.unitOfWork.stage(
      () => {
        previous = this.anexos.get(stored.ticketId);
        this.anexos.set(stored.ticketId, [...(previous ?? []), stored]);
      },
      () => {
        if (!previous) this.anexos.delete(stored.ticketId);
        else this.anexos.set(stored.ticketId, previous);
      },
    );
  }

  async listarPorTicket(ticketId: string): Promise<Anexo[]> {
    return structuredClone(this.anexos.get(ticketId) ?? []);
  }

  async buscarPorId(ticketId: string, anexoId: string): Promise<Anexo | null> {
    const anexo = (this.anexos.get(ticketId) ?? []).find(({ id }) => id === anexoId);
    return anexo ? structuredClone(anexo) : null;
  }
}
