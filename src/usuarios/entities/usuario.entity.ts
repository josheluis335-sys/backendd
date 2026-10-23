import { UserRole } from '../../common/enums/user-role.enum.js';

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  passwordHash: string;
  rol: Exclude<UserRole, UserRole.SOLICITANTE>;
  areaId: string;
  activo: boolean;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

export class UsuarioEmailConflictError extends Error {}

export type UsuarioPublico = Omit<Usuario, 'passwordHash'>;
