import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum.js';

export class UpdateUsuarioDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres.' })
  nombre?: string;

  @IsOptional()
  @IsEnum([UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR], {
    message: 'El rol seleccionado no es válido.',
  })
  rol?: UserRole.AGENTE | UserRole.SUPERVISOR | UserRole.ADMINISTRADOR;

  @IsOptional()
  @IsUUID('4', { message: 'El área debe ser un identificador válido.' })
  areaId?: string;
}
