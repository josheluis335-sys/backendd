import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Categoria,
  CategoriaNameConflictError,
} from '../entities/categoria.entity.js';
import type { CategoriasRepository } from '../interfaces/categorias.repository.interface.js';

@Injectable()
export class InMemoryCategoriasRepository implements CategoriasRepository {
  private readonly categorias = new Map<string, Categoria>();

  async findAll(activa?: boolean): Promise<Categoria[]> {
    return Array.from(this.categorias.values())
      .filter((categoria) => activa === undefined || categoria.activa === activa)
      .map((categoria) => structuredClone(categoria));
  }

  async findActiveByAreaId(areaId: string): Promise<Categoria[]> {
    return Array.from(this.categorias.values())
      .filter((categoria) => categoria.activa && categoria.areaSugeridaId === areaId)
      .map((categoria) => structuredClone(categoria));
  }

  async findById(id: string): Promise<Categoria | null> {
    const categoria = this.categorias.get(id);
    return categoria ? structuredClone(categoria) : null;
  }

  async findByName(nombre: string, exceptId?: string): Promise<Categoria | null> {
    const normalizedName = this.normalizeName(nombre);
    for (const categoria of this.categorias.values()) {
      if (
        categoria.id !== exceptId &&
        this.normalizeName(categoria.nombre) === normalizedName
      ) {
        return structuredClone(categoria);
      }
    }
    return null;
  }

  async create(
    categoria: Omit<Categoria, 'id'> & { id?: string },
  ): Promise<Categoria> {
    if (this.findByNameSync(categoria.nombre)) {
      throw new CategoriaNameConflictError();
    }
    const record: Categoria = {
      id: categoria.id ?? randomUUID(),
      nombre: categoria.nombre.trim(),
      activa: categoria.activa ?? true,
      areaSugeridaId: structuredClone(categoria.areaSugeridaId),
    };
    this.categorias.set(record.id, record);
    return structuredClone(record);
  }

  async update(
    id: string,
    changes: Partial<Pick<Categoria, 'nombre' | 'activa' | 'areaSugeridaId'>>,
  ): Promise<Categoria | null> {
    const current = this.categorias.get(id);
    if (!current) {
      return null;
    }
    if (changes.nombre !== undefined && this.findByNameSync(changes.nombre, id)) {
      throw new CategoriaNameConflictError();
    }
    const updated: Categoria = {
      ...structuredClone(current),
      ...structuredClone(changes),
      nombre: changes.nombre?.trim() ?? current.nombre,
    };
    this.categorias.set(id, updated);
    return structuredClone(updated);
  }

  private normalizeName(nombre: string): string {
    return nombre.trim().toLowerCase();
  }

  private findByNameSync(nombre: string, exceptId?: string): Categoria | null {
    const normalizedName = this.normalizeName(nombre);
    for (const categoria of this.categorias.values()) {
      if (
        categoria.id !== exceptId &&
        this.normalizeName(categoria.nombre) === normalizedName
      ) {
        return structuredClone(categoria);
      }
    }
    return null;
  }

}
