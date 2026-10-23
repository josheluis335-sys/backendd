import type { Anotacion } from '../entities/anotacion.entity.js';

export interface AnotacionesRepository {
  agregar(anotacion: Anotacion): Promise<void>;
  listarPorTicket(ticketId: string): Promise<Anotacion[]>;
}
