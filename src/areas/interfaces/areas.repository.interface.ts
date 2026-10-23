import { Area } from '../entities/area.entity.js';

export interface AreasRepository {
  findAll(activa?: boolean): Promise<Area[]>;
  findById(id: string): Promise<Area | null>;
  findByName(nombre: string, exceptId?: string): Promise<Area | null>;
  create(area: Omit<Area, 'id'> & { id?: string }): Promise<Area>;
  update(
    id: string,
    changes: Partial<Pick<Area, 'nombre' | 'activa'>>,
  ): Promise<Area | null>;
}
