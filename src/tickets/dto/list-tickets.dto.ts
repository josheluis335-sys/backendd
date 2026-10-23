import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../entities/ticket.entity.js';
import { SlaState } from '../../sla/sla-state.enum.js';

export class ListTicketsDto {
  @IsOptional()
  @IsEnum(TicketStatus, { message: 'El estado seleccionado no es válido.' })
  estado?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketType, { message: 'El tipo seleccionado no es válido.' })
  tipo?: TicketType;

  @IsOptional()
  @IsEnum(TicketPriority, { message: 'La prioridad seleccionada no es válida.' })
  prioridad?: TicketPriority;

  @IsOptional()
  @IsUUID('4', { message: 'El área debe ser un identificador válido.' })
  areaId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'La categoría debe ser un identificador válido.' })
  categoriaId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El número debe ser texto.' })
  numero?: string;

  @IsOptional()
  @IsEnum(SlaState, { message: 'El estado del SLA seleccionado no es válido.' })
  slaEstado?: SlaState;

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
