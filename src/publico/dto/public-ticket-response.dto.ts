import { ApiProperty } from '@nestjs/swagger';
import type { Ticket } from '../../tickets/entities/ticket.entity.js';
import { TicketStatus, TicketType } from '../../tickets/entities/ticket.entity.js';

export class PublicTicketResponseDto {
  @ApiProperty({ example: 'INC0001', pattern: '^(INC|REQ)\\d{4,}$' })
  numero!: string;

  @ApiProperty({ enum: TicketType })
  tipo!: TicketType;

  @ApiProperty({ enum: TicketStatus })
  estado!: TicketStatus;

  @ApiProperty({ format: 'date-time' })
  fechaUltimaActualizacion!: string;

  static fromTicket(ticket: Ticket): PublicTicketResponseDto {
    return Object.assign(new PublicTicketResponseDto(), {
      numero: ticket.numero,
      tipo: ticket.tipo,
      estado: ticket.estado,
      fechaUltimaActualizacion: ticket.fechaUltimaActualizacion.toISOString(),
    });
  }
}
