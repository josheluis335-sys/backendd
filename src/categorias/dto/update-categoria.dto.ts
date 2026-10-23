import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateCategoriaDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre de la categoría debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre de la categoría no puede estar vacío.' })
  @MinLength(1, { message: 'El nombre de la categoría no puede estar vacío.' })
  @MaxLength(120, { message: 'El nombre de la categoría no puede superar 120 caracteres.' })
  nombre?: string;

  @IsOptional()
  @IsBoolean({ message: 'El campo activa debe ser verdadero o falso.' })
  activa?: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'El área sugerida debe ser un identificador válido.' })
  areaSugeridaId?: string;
}
