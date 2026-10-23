import type { NotificationResult } from '../../notificaciones/notificaciones.service.js';
import type { Ticket } from '../entities/ticket.entity.js';

export interface TicketActionResponseDto extends Omit<Ticket, 'version'> {
  notificacion: NotificationResult;
}

export function ticketWithoutVersion(ticket: Ticket): Omit<Ticket, 'version'> {
  const { version: _version, ...response } = ticket;
  return response;
}
