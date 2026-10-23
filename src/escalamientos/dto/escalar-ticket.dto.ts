import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, registerDecorator } from 'class-validator';

function controlFree(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function IsControlFree(): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isControlFree',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: { validate: controlFree },
      options: { message: 'El comentario no puede contener caracteres de control.' },
    });
  };
}

export class EscalarTicketDto {
  @IsUUID('4', { message: 'El área debe ser un identificador válido.' })
  areaId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'El usuario receptor debe ser un identificador válido.' })
  recibidoPorId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El comentario debe ser texto.' })
  @Length(5, 500, { message: 'El comentario debe tener entre 5 y 500 caracteres.' })
  @IsControlFree()
  comentario!: string;
}
