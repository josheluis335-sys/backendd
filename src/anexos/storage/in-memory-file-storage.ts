import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StoredFileNotFoundError } from '../interfaces/file-storage.interface.js';
import type { FileStorage } from '../interfaces/file-storage.interface.js';

@Injectable()
export class InMemoryFileStorage implements FileStorage {
  private readonly files = new Map<string, Buffer>();

  async guardar(contents: Buffer): Promise<string> {
    const key = randomUUID();
    this.files.set(key, Buffer.from(contents));
    return key;
  }

  async leer(key: string): Promise<Buffer> {
    const contents = this.files.get(key);
    if (!contents) throw new StoredFileNotFoundError('No se encontró el archivo almacenado.');
    return Buffer.from(contents);
  }

  async eliminar(key: string): Promise<void> {
    this.files.delete(key);
  }
}
