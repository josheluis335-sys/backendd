import type { Ticket } from '../entities/ticket.entity.js';
import type { TicketSla } from '../../sla/sla.service.js';

export interface SupportTicketResponseDto extends Omit<Ticket, 'version'> {
  sla: TicketSla;
}

// Keep public-portal contracts separate: public DTOs must never inherit this support-only SLA DTO.
export type PublicTicketResponseDto = Omit<Ticket, 'solicitanteCorreo' | 'version'>;

export function toSupportTicketResponse(
  ticket: Ticket,
  sla: TicketSla,
): SupportTicketResponseDto {
  const { version: _version, ...response } = ticket;
  return { ...response, sla };
}

export function toPublicTicketResponse(ticket: Ticket): PublicTicketResponseDto {
  const {
    solicitanteCorreo: _solicitanteCorreo,
    version: _version,
    ...publicTicket
  } = ticket;
  return publicTicket;
}
