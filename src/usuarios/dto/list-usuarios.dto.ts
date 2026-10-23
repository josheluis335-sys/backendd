import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum.js';

export class ListUsuariosDto {
  @IsOptional()
  @IsEnum([UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR], {
    message: 'El rol seleccionado no es válido.',
  })
  rol?: UserRole.AGENTE | UserRole.SUPERVISOR | UserRole.ADMINISTRADOR;

  @IsOptional()
  @IsUUID('4', { message: 'El área debe ser un identificador válido.' })
  areaId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'El filtro activo debe ser verdadero o falso.' })
  activo?: boolean;

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
