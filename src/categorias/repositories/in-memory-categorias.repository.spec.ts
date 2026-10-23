import { InMemoryCategoriasRepository } from './in-memory-categorias.repository.js';

describe('InMemoryCategoriasRepository copies', () => {
  it('does not expose stored category objects through create, queries, or update', async () => {
    const repository = new InMemoryCategoriasRepository();
    const created = await repository.create({
      nombre: 'Accesos',
      activa: true,
      areaSugeridaId: 'area-1',
    });
    created.nombre = 'alterada';
    (await repository.findAll())[0].areaSugeridaId = 'area-mutada';
    (await repository.findById(created.id))!.activa = false;

    const updated = await repository.update(created.id, { nombre: 'Soporte' });
    updated!.nombre = 'mutada';

    expect(await repository.findActiveByAreaId('area-1')).toHaveLength(1);
    expect((await repository.findById(created.id))?.nombre).toBe('Soporte');
  });
});
