import { Transform } from 'class-transformer';
import { IsString, Length, registerDecorator } from 'class-validator';

function controlFree(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function IsControlFree(message: string): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isControlFree',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: { validate: controlFree },
      options: { message },
    });
  };
}

export class PauseTicketDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El motivo debe ser texto.' })
  @Length(5, 500, { message: 'El motivo debe tener entre 5 y 500 caracteres.' })
  @IsControlFree('El motivo no puede contener caracteres de control.')
  motivo!: string;
}

export class CloseTicketDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La solución debe ser texto.' })
  @Length(10, 2000, { message: 'La solución debe tener entre 10 y 2000 caracteres.' })
  @IsControlFree('La solución no puede contener caracteres de control.')
  solucion!: string;
}
