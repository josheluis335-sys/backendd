import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAreaDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre del área debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre del área es obligatorio.' })
  @MinLength(1, { message: 'El nombre del área no puede estar vacío.' })
  @MaxLength(120, { message: 'El nombre del área no puede superar 120 caracteres.' })
  nombre!: string;
}
