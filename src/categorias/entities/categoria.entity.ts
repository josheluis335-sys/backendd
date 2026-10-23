export interface Categoria {
  id: string;
  nombre: string;
  activa: boolean;
  areaSugeridaId: string;
}

export class CategoriaNameConflictError extends Error {
  constructor() {
    super('Ya existe una categoría con ese nombre.');
    this.name = 'CategoriaNameConflictError';
  }
}
