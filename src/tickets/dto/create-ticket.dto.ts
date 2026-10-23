import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  registerDecorator,
} from 'class-validator';
import {
  TicketChannel,
  TicketPriority,
  TicketType,
} from '../entities/ticket.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

function hasNoControlCharacters(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return false;
    }
  }
  return true;
}

function IsControlCharacterFree(message: string): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isControlCharacterFree',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate: hasNoControlCharacters,
        defaultMessage: () => message,
      },
    });
  };
}

export class CreateTicketDto {
  @IsEnum(TicketType, { message: 'El tipo de ticket no es válido.' })
  tipo!: TicketType;

  @Transform(trim)
  @IsString({ message: 'El título debe ser texto.' })
  @Length(5, 150, { message: 'El título debe tener entre 5 y 150 caracteres.' })
  @IsControlCharacterFree('El título no puede contener caracteres de control.')
  titulo!: string;

  @Transform(trim)
  @IsString({ message: 'La descripción debe ser texto.' })
  @Length(10, 5000, { message: 'La descripción debe tener entre 10 y 5000 caracteres.' })
  @IsControlCharacterFree('La descripción no puede contener caracteres de control.')
  descripcion!: string;

  @IsUUID('4', { message: 'La categoría debe ser un identificador válido.' })
  categoriaId!: string;

  @IsEnum(TicketPriority, { message: 'La prioridad no es válida.' })
  prioridad!: TicketPriority;

  @IsEnum(TicketChannel, { message: 'El canal no es válido.' })
  canal!: TicketChannel;

  @Transform(trim)
  @IsString({ message: 'El nombre del solicitante debe ser texto.' })
  @Length(2, 100, { message: 'El nombre del solicitante debe tener entre 2 y 100 caracteres.' })
  @IsControlCharacterFree('El nombre no puede contener caracteres de control.')
  solicitanteNombre!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo del solicitante debe ser válido.' })
  @MaxLength(254, { message: 'El correo del solicitante no puede superar 254 caracteres.' })
  @IsControlCharacterFree('El correo no puede contener caracteres de control.')
  solicitanteCorreo!: string;
}
