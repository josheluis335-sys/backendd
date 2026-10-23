import { InMemoryAreasRepository } from './in-memory-areas.repository.js';

describe('InMemoryAreasRepository copies', () => {
  it('does not expose stored area objects through create, find, or update', async () => {
    const repository = new InMemoryAreasRepository();
    const created = await repository.create({ nombre: 'Seguridad', activa: true });
    created.nombre = 'alterada';
    (await repository.findById(created.id))!.nombre = 'alterada otra vez';

    const updated = await repository.update(created.id, { nombre: 'Soporte' });
    updated!.nombre = 'mutada';

    expect((await repository.findById(created.id))?.nombre).toBe('Soporte');
  });
});
