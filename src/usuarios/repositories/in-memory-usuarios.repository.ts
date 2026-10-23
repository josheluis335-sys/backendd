import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UserRole } from '../../common/enums/user-role.enum.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { UsuarioEmailConflictError } from '../entities/usuario.entity.js';
import { ClockService } from '../../common/clock/clock.service.js';
import type {
  UsuarioFilters,
  UsuariosRepository,
} from '../interfaces/usuarios.repository.interface.js';

@Injectable()
export class InMemoryUsuariosRepository implements UsuariosRepository {
  private readonly usuarios = new Map<string, Usuario>();

  constructor(
    @Optional()
    @Inject(ClockService)
    private readonly clock = new ClockService(),
  ) {}

  async findById(id: string): Promise<Usuario | null> {
    const usuario = this.usuarios.get(id);
    return usuario ? structuredClone(usuario) : null;
  }

  async findByEmail(correo: string): Promise<Usuario | null> {
    const normalizedEmail = this.normalizeEmail(correo);
    for (const usuario of this.usuarios.values()) {
      if (this.normalizeEmail(usuario.correo) === normalizedEmail) {
        return structuredClone(usuario);
      }
    }
    return null;
  }

  async list(filters: Omit<UsuarioFilters, 'offset' | 'limit'> = {}): Promise<Usuario[]> {
    return Array.from(this.usuarios.values())
      .filter((usuario) => filters.rol === undefined || usuario.rol === filters.rol)
      .filter((usuario) => filters.areaId === undefined || usuario.areaId === filters.areaId)
      .filter((usuario) => filters.activo === undefined || usuario.activo === filters.activo)
      .map((usuario) => structuredClone(usuario));
  }

  async create(
    user: Omit<Usuario, 'id' | 'fechaCreacion' | 'fechaActualizacion'> & {
      id?: string;
      fechaCreacion?: Date;
      fechaActualizacion?: Date;
    },
  ): Promise<Usuario> {
    const correo = this.normalizeEmail(user.correo);
    if (this.findByEmailSync(correo)) {
      throw new UsuarioEmailConflictError();
    }
    const now = this.clock.ahora();
    const usuario: Usuario = {
      ...structuredClone(user),
      id: user.id ?? randomUUID(),
      correo,
      activo: user.activo ?? true,
      fechaCreacion: user.fechaCreacion ?? now,
      fechaActualizacion: user.fechaActualizacion ?? now,
    };
    this.usuarios.set(usuario.id, usuario);
    return structuredClone(usuario);
  }

  async update(
    id: string,
    changes: Partial<Pick<Usuario, 'nombre' | 'rol' | 'areaId' | 'activo' | 'passwordHash'>>,
  ): Promise<Usuario | null> {
    const current = this.usuarios.get(id);
    if (!current) {
      return null;
    }
    const updated: Usuario = {
      ...structuredClone(current),
      ...structuredClone(changes),
      fechaActualizacion: this.clock.ahora(),
    };
    this.usuarios.set(id, updated);
    return structuredClone(updated);
  }

  async countActiveAdministrators(): Promise<number> {
    return Array.from(this.usuarios.values()).filter(
      (usuario) => usuario.activo && usuario.rol === UserRole.ADMINISTRADOR,
    ).length;
  }

  async countActiveByAreaId(areaId: string): Promise<number> {
    return Array.from(this.usuarios.values()).filter(
      (usuario) => usuario.activo && usuario.areaId === areaId,
    ).length;
  }

  private normalizeEmail(correo: string): string {
    return correo.trim().toLowerCase();
  }

  private findByEmailSync(correo: string): Usuario | null {
    const normalizedEmail = this.normalizeEmail(correo);
    for (const usuario of this.usuarios.values()) {
      if (this.normalizeEmail(usuario.correo) === normalizedEmail) {
        return usuario;
      }
    }
    return null;
  }
}
