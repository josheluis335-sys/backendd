import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCategoriaDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre de la categoría debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre de la categoría es obligatorio.' })
  @MinLength(1, { message: 'El nombre de la categoría no puede estar vacío.' })
  @MaxLength(120, { message: 'El nombre de la categoría no puede superar 120 caracteres.' })
  nombre!: string;

  @IsUUID('4', { message: 'El área sugerida debe ser un identificador válido.' })
  areaSugeridaId!: string;
}
