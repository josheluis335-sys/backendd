import type { UserRole } from '../../common/enums/user-role.enum.js';
import type { Usuario } from '../entities/usuario.entity.js';

export interface UsuarioFilters {
  rol?: Exclude<UserRole, UserRole.SOLICITANTE>;
  areaId?: string;
  activo?: boolean;
  offset?: number;
  limit?: number;
}

export interface UsuariosRepository {
  findById(id: string): Promise<Usuario | null>;
  findByEmail(correo: string): Promise<Usuario | null>;
  list(filters?: Omit<UsuarioFilters, 'offset' | 'limit'>): Promise<Usuario[]>;
  create(
    user: Omit<Usuario, 'id' | 'fechaCreacion' | 'fechaActualizacion'> & {
      id?: string;
      fechaCreacion?: Date;
      fechaActualizacion?: Date;
    },
  ): Promise<Usuario>;
  update(
    id: string,
    changes: Partial<Pick<Usuario, 'nombre' | 'rol' | 'areaId' | 'activo' | 'passwordHash'>>,
  ): Promise<Usuario | null>;
  countActiveAdministrators(): Promise<number>;
  countActiveByAreaId(areaId: string): Promise<number>;
}
