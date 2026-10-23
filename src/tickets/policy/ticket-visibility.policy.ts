import { Injectable } from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum.js';
import type { Ticket } from '../entities/ticket.entity.js';
import { EscalamientosService } from '../../escalamientos/escalamientos.service.js';

export interface TicketActor {
  id: string;
  rol: UserRole;
  areaId?: string | null;
}

@Injectable()
export class TicketVisibilityPolicy {
  constructor(private readonly escalamientosService: EscalamientosService) {}

  async canSee(actor: TicketActor, ticket: Ticket): Promise<boolean> {
    if (actor.rol === UserRole.ADMINISTRADOR) {
      return true;
    }
    if (actor.rol === UserRole.SUPERVISOR) {
      return actor.areaId === ticket.areaActualId;
    }
    if (actor.rol === UserRole.AGENTE) {
      if (ticket.creadoPorId === actor.id) {
        return true;
      }
      const latest = await this.escalamientosService.ultimoPorTicket(ticket.id);
      return latest?.recibidoPorId === actor.id;
    }
    return false;
  }

}
