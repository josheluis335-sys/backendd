import { IsEnum, IsUUID } from 'class-validator';
import { TicketPriority, TicketType } from '../../tickets/entities/ticket.entity.js';

export class ConvertirComunicacionDto {
  @IsUUID('4', { message: 'La categoría debe ser un identificador válido.' })
  categoriaId!: string;

  @IsEnum(TicketType, { message: 'El tipo de ticket no es válido.' })
  tipo!: TicketType;

  @IsEnum(TicketPriority, { message: 'La prioridad no es válida.' })
  prioridad!: TicketPriority;
}
