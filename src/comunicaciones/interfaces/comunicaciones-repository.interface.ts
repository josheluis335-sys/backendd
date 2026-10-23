import type { Comunicacion } from '../entities/comunicacion.entity.js';

export interface ComunicacionesRepository {
  insertarSiNuevo(
    comunicacion: Comunicacion,
    maxPendientes: number,
  ): Promise<'INSERTED' | 'DUPLICATE' | 'FULL'>;
  buscarPorMessageId(messageId: string): Promise<Comunicacion | null>;
  buscarPorId(id: string): Promise<Comunicacion | null>;
  listar(): Promise<Comunicacion[]>;
  marcarConvertido(id: string, ticketId: string): Promise<void>;
}
