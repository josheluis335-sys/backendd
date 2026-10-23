import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Area, AreaNameConflictError } from '../entities/area.entity.js';
import { AreasRepository } from '../interfaces/areas.repository.interface.js';

@Injectable()
export class InMemoryAreasRepository implements AreasRepository {
  private readonly areas = new Map<string, Area>();

  async findAll(activa?: boolean): Promise<Area[]> {
    const records = Array.from(this.areas.values());
    return records
      .filter((area) => activa === undefined || area.activa === activa)
      .map((area) => structuredClone(area));
  }

  async findById(id: string): Promise<Area | null> {
    const area = this.areas.get(id);
    return area ? structuredClone(area) : null;
  }

  async findByName(nombre: string, exceptId?: string): Promise<Area | null> {
    return this.findByNameSync(nombre, exceptId);
  }

  async create(area: Omit<Area, 'id'> & { id?: string }): Promise<Area> {
    if (this.findByNameSync(area.nombre)) {
      throw new AreaNameConflictError();
    }
    const record: Area = {
      ...structuredClone(area),
      id: area.id ?? randomUUID(),
      nombre: area.nombre.trim(),
      activa: area.activa ?? true,
    };
    this.areas.set(record.id, record);
    return structuredClone(record);
  }

  async update(
    id: string,
    changes: Partial<Pick<Area, 'nombre' | 'activa'>>,
  ): Promise<Area | null> {
    const current = this.areas.get(id);
    if (!current) {
      return null;
    }
    if (changes.nombre !== undefined && this.findByNameSync(changes.nombre, id)) {
      throw new AreaNameConflictError();
    }

    const updated: Area = {
      ...structuredClone(current),
      ...structuredClone(changes),
      nombre: changes.nombre?.trim() ?? current.nombre,
    };
    this.areas.set(id, updated);
    return structuredClone(updated);
  }

  private normalizeName(nombre: string): string {
    return nombre.trim().toLowerCase();
  }

  private findByNameSync(nombre: string, exceptId?: string): Area | null {
    const normalizedName = this.normalizeName(nombre);
    for (const area of this.areas.values()) {
      if (area.id !== exceptId && this.normalizeName(area.nombre) === normalizedName) {
        return structuredClone(area);
      }
    }
    return null;
  }
}
