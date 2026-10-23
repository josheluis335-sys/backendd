import { Categoria } from '../entities/categoria.entity.js';

export interface CategoriasRepository {
  findAll(activa?: boolean): Promise<Categoria[]>;
  findActiveByAreaId(areaId: string): Promise<Categoria[]>;
  findById(id: string): Promise<Categoria | null>;
  findByName(nombre: string, exceptId?: string): Promise<Categoria | null>;
  create(categoria: Omit<Categoria, 'id'> & { id?: string }): Promise<Categoria>;
  update(
    id: string,
    changes: Partial<Pick<Categoria, 'nombre' | 'activa' | 'areaSugeridaId'>>,
  ): Promise<Categoria | null>;
}
