import type { Ticket } from '../entities/ticket.entity.js';

export interface TicketsRepository {
  create(ticket: Ticket): Promise<Ticket>;
  findById(id: string): Promise<Ticket | null>;
  findAll(): Promise<Ticket[]>;
  actualizar(ticket: Ticket, versionEsperada: number): Promise<Ticket>;
}

export class TicketVersionConflictError extends Error {}
