import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ComunicacionEstado } from '../entities/comunicacion.entity.js';

export class ListComunicacionesDto {
  @IsOptional()
  @IsEnum(ComunicacionEstado, { message: 'El estado del correo no es válido.' })
  estado?: ComunicacionEstado;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un entero.' })
  @Min(1, { message: 'La página debe ser al menos 1.' })
  page = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt({ message: 'El tamaño de página debe ser un entero.' })
  @Min(1, { message: 'El tamaño de página debe ser al menos 1.' })
  @Max(100, { message: 'El tamaño máximo de página es 100.' })
  pageSize = 20;
}
