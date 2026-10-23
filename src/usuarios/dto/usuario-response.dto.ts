import { UserRole } from '../../common/enums/user-role.enum.js';
import { Usuario } from '../entities/usuario.entity.js';

export class UsuarioResponseDto {
  id!: string;
  nombre!: string;
  correo!: string;
  rol!: Exclude<UserRole, UserRole.SOLICITANTE>;
  areaId!: string;
  activo!: boolean;
  fechaCreacion!: Date;
  fechaActualizacion!: Date;

  static fromEntity(usuario: Usuario): UsuarioResponseDto {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      areaId: usuario.areaId,
      activo: usuario.activo,
      fechaCreacion: usuario.fechaCreacion,
      fechaActualizacion: usuario.fechaActualizacion,
    };
  }
}

export class UsuarioDirectorioResponseDto {
  id!: string;
  nombre!: string;
  rol!: Exclude<UserRole, UserRole.SOLICITANTE>;
  area!: { id: string; nombre: string };
}
