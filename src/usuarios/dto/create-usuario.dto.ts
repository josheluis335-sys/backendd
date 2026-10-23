import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { IsValidInitialPassword } from '../validation/password-policy.decorator.js';

export class CreateUsuarioDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres.' })
  nombre!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo no es válido.' })
  correo!: string;

  @IsValidInitialPassword()
  password!: string;

  @IsEnum([UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR], {
    message: 'El rol seleccionado no es válido.',
  })
  rol!: UserRole.AGENTE | UserRole.SUPERVISOR | UserRole.ADMINISTRADOR;

  @IsUUID('4', { message: 'El área debe ser un identificador válido.' })
  areaId!: string;
}
