import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SlaState } from '../../sla/sla-state.enum.js';
import {
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../entities/ticket.entity.js';

export class ListSupervisorTicketsDto {
  @IsOptional()
  @IsEnum(TicketStatus, { message: 'El estado seleccionado no es válido.' })
  estado?: TicketStatus;

  @IsOptional()
  @IsEnum(SlaState, { message: 'El estado del SLA seleccionado no es válido.' })
  slaEstado?: SlaState;

  @IsOptional()
  @IsEnum(TicketType, { message: 'El tipo seleccionado no es válido.' })
  tipo?: TicketType;

  @IsOptional()
  @IsEnum(TicketPriority, { message: 'La prioridad seleccionada no es válida.' })
  prioridad?: TicketPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página mínima es 1.' })
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de página mínimo es 1.' })
  @Max(100, { message: 'El tamaño de página máximo es 100.' })
  pageSize = 20;
}
