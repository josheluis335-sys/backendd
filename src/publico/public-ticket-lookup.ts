import { Inject, Injectable } from '@nestjs/common';
import { TICKETS_REPOSITORY } from '../tickets/tickets.constants.js';
import type { TicketsRepository } from '../tickets/interfaces/tickets.repository.interface.js';
import type { PublicTicketLookup } from './interfaces/public-ticket-lookup.interface.js';

@Injectable()
export class RepositoryPublicTicketLookup implements PublicTicketLookup {
  constructor(
    @Inject(TICKETS_REPOSITORY)
    private readonly repository: TicketsRepository,
  ) {}

  async buscarPorNumero(numero: string) {
    const tickets = await this.repository.findAll();
    return tickets.find((ticket) => ticket.numero === numero) ?? null;
  }
}
