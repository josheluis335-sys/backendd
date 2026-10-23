import type { Escalamiento } from '../entities/escalamiento.entity.js';

export interface EscalamientosRepository {
  agregar(escalamiento: Escalamiento): Promise<void>;
  listarPorTicket(ticketId: string): Promise<Escalamiento[]>;
  listarPorTickets(ticketIds: readonly string[]): Promise<Map<string, Escalamiento[]>>;
}
