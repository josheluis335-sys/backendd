import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskFileStorage } from './disk-file-storage.js';
import { InMemoryFileStorage } from './in-memory-file-storage.js';

describe('file storage implementations', () => {
  it('copies buffers in memory and uses opaque UUID disk keys', async () => {
    const memory = new InMemoryFileStorage();
    const original = Buffer.from('bytes');
    const memoryKey = await memory.guardar(original);
    original.fill(0);
    expect((await memory.leer(memoryKey)).toString()).toBe('bytes');

    const directory = await mkdtemp(join(tmpdir(), 'backendd-upload-test-'));
    try {
      const disk = new DiskFileStorage(directory);
      const key = await disk.guardar(Buffer.from('archivo'));
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect((await disk.leer(key)).toString()).toBe('archivo');
      await expect(disk.leer('..\\outside')).rejects.toThrow('Clave de almacenamiento inválida.');
      await disk.eliminar(key);
      await expect(disk.leer(key)).rejects.toThrow('No se encontró el archivo almacenado.');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
