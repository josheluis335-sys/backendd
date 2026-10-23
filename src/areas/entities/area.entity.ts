export interface Area {
  id: string;
  nombre: string;
  activa: boolean;
}

export class AreaNameConflictError extends Error {
  constructor() {
    super('Ya existe un área con ese nombre.');
    this.name = 'AreaNameConflictError';
  }
}
