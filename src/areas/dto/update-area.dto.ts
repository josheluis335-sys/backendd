import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAreaDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre del área debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre del área no puede estar vacío.' })
  @MinLength(1, { message: 'El nombre del área no puede estar vacío.' })
  @MaxLength(120, { message: 'El nombre del área no puede superar 120 caracteres.' })
  nombre?: string;

  @IsOptional()
  @IsBoolean({ message: 'El campo activa debe ser verdadero o falso.' })
  activa?: boolean;
}
