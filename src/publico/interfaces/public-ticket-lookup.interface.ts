import type { Ticket } from '../../tickets/entities/ticket.entity.js';

export interface PublicTicketLookup {
  buscarPorNumero(numero: string): Promise<Ticket | null>;
}

export type PublicEmailComparator = (expected: string, received: string) => boolean;
