import type { EventoBitacora } from '../entities/evento-bitacora.entity.js';

export interface BitacoraRepository {
  agregar(evento: EventoBitacora): Promise<void>;
  listarPorTicket(ticketId: string): Promise<EventoBitacora[]>;
}
