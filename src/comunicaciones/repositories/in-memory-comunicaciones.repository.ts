import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../../tickets/tickets.constants.js';
import { ComunicacionEstado } from '../entities/comunicacion.entity.js';
import type { Comunicacion } from '../entities/comunicacion.entity.js';
import type { ComunicacionesRepository } from '../interfaces/comunicaciones-repository.interface.js';

@Injectable()
export class InMemoryComunicacionesRepository implements ComunicacionesRepository {
  private readonly comunicaciones = new Map<string, Comunicacion>();
  private readonly idsPorMessageId = new Map<string, string>();

  constructor(
    @Optional()
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork = new TicketActionUnitOfWork(),
  ) {}

  async insertarSiNuevo(
    comunicacion: Comunicacion,
    maxPendientes: number,
  ): Promise<'INSERTED' | 'DUPLICATE' | 'FULL'> {
    if (this.idsPorMessageId.has(comunicacion.messageId)) return 'DUPLICATE';
    const pending = Array.from(this.comunicaciones.values()).filter(
      (item) => item.estado === ComunicacionEstado.PENDIENTE,
    ).length;
    if (comunicacion.estado === ComunicacionEstado.PENDIENTE && pending >= maxPendientes) {
      return 'FULL';
    }
    const stored = structuredClone(comunicacion);
    this.idsPorMessageId.set(stored.messageId, stored.id);
    this.comunicaciones.set(stored.id, stored);
    return 'INSERTED';
  }

  async buscarPorMessageId(messageId: string): Promise<Comunicacion | null> {
    const id = this.idsPorMessageId.get(messageId);
    return id ? this.buscarPorId(id) : null;
  }

  async buscarPorId(id: string): Promise<Comunicacion | null> {
    const communication = this.comunicaciones.get(id);
    return communication ? structuredClone(communication) : null;
  }

  async listar(): Promise<Comunicacion[]> {
    return Array.from(this.comunicaciones.values(), (item) => structuredClone(item));
  }

  async marcarConvertido(id: string, ticketId: string): Promise<void> {
    const current = this.comunicaciones.get(id);
    if (!current || current.estado !== ComunicacionEstado.PENDIENTE) {
      throw new ConflictException('El correo ya fue procesado o no está disponible.');
    }
    const updated: Comunicacion = {
      ...current,
      estado: ComunicacionEstado.CONVERTIDO,
      ticketId,
      motivoDescarte: null,
    };
    await this.unitOfWork.stage(
      () => {
        const latest = this.comunicaciones.get(id);
        if (!latest || latest.estado !== ComunicacionEstado.PENDIENTE) {
          throw new ConflictException('El correo ya fue procesado o no está disponible.');
        }
        this.comunicaciones.set(id, structuredClone(updated));
      },
      () => {
        this.comunicaciones.set(id, structuredClone(current));
      },
    );
  }
}
