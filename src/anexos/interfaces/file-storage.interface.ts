export interface FileStorage {
  guardar(contents: Buffer): Promise<string>;
  leer(key: string): Promise<Buffer>;
  eliminar(key: string): Promise<void>;
}

export class StoredFileNotFoundError extends Error {}
