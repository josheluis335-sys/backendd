import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DiskFileStorage } from './disk-file-storage.js';

describe('DiskFileStorage path containment', () => {
  it('rejects traversal keys and never reads a file outside UPLOADS_DIR', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'private-uploads-'));
    const outsidePath = join(tmpdir(), `outside-${randomUUID()}.txt`);
    let outsideFileCreated = false;
    try {
      await writeFile(outsidePath, 'outside secret');
      outsideFileCreated = true;
      const storage = new DiskFileStorage(directory);
      await expect(storage.leer(`../${basename(outsidePath)}`)).rejects.toThrow(
        'Clave de almacenamiento inválida.',
      );
      await expect(storage.eliminar(`../${basename(outsidePath)}`)).rejects.toThrow(
        'Clave de almacenamiento inválida.',
      );
      await expect(readFile(outsidePath, 'utf8')).resolves.toBe('outside secret');
    } finally {
      if (outsideFileCreated) await unlink(outsidePath);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
