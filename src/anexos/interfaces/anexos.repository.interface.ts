import type { Anexo } from '../entities/anexo.entity.js';

export interface AnexosRepository {
  agregar(anexo: Anexo): Promise<void>;
  listarPorTicket(ticketId: string): Promise<Anexo[]>;
  buscarPorId(ticketId: string, anexoId: string): Promise<Anexo | null>;
}
