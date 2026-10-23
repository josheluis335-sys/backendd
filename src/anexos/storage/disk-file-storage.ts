import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { StoredFileNotFoundError } from '../interfaces/file-storage.interface.js';
import type { FileStorage } from '../interfaces/file-storage.interface.js';

@Injectable()
export class DiskFileStorage implements FileStorage {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
  }

  async guardar(contents: Buffer): Promise<string> {
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
    } catch {
      throw new Error('No se pudo preparar el almacenamiento de archivos.');
    }
    const key = randomUUID();
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(this.resolveKey(key), 'wx', 0o600);
      await file.writeFile(contents);
      await file.close();
    } catch {
      const cleanupErrors: Error[] = [];
      if (file) {
        try {
          await file.close();
        } catch {
          cleanupErrors.push(new Error('No se pudo cerrar el archivo temporal.'));
        }
        try {
          await unlink(this.resolveKey(key));
        } catch (cleanupError) {
          const missing =
            typeof cleanupError === 'object' &&
            cleanupError !== null &&
            'code' in cleanupError &&
            cleanupError.code === 'ENOENT';
          if (!missing) {
            cleanupErrors.push(new Error('No se pudo limpiar el archivo temporal.'));
          }
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [new Error('No se pudo guardar el archivo.'), ...cleanupErrors],
          'Falló el almacenamiento y su compensación.',
        );
      }
      throw new Error('No se pudo guardar el archivo.');
    }
    return key;
  }

  async leer(key: string): Promise<Buffer> {
    const path = this.resolveKey(key);
    try {
      return await readFile(path);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new StoredFileNotFoundError('No se encontró el archivo almacenado.');
      }
      throw new Error('No se pudo leer el archivo almacenado.');
    }
  }

  async eliminar(key: string): Promise<void> {
    const path = this.resolveKey(key);
    try {
      await unlink(path);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw new Error('No se pudo eliminar el archivo almacenado.');
    }
  }

  private resolveKey(key: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw new Error('Clave de almacenamiento inválida.');
    }
    return join(this.directory, key);
  }
}
