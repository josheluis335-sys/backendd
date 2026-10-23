import { ConflictException, NotFoundException } from '@nestjs/common';
import { AreasService } from './areas.service.js';
import { INITIAL_AREA_NAMES } from './areas.constants.js';
import { InMemoryAreasRepository } from './repositories/in-memory-areas.repository.js';
import { InMemoryCategoriasRepository } from '../categorias/repositories/in-memory-categorias.repository.js';
import { InMemoryUsuariosRepository } from '../usuarios/repositories/in-memory-usuarios.repository.js';
import { UserRole } from '../common/enums/user-role.enum.js';

describe('AreasService', () => {
  let repository: InMemoryAreasRepository;
  let categories: InMemoryCategoriasRepository;
  let users: InMemoryUsuariosRepository;
  let service: AreasService;

  beforeEach(async () => {
    repository = new InMemoryAreasRepository();
    categories = new InMemoryCategoriasRepository();
    users = new InMemoryUsuariosRepository();
    service = new AreasService(repository, categories, users);
    await service.onModuleInit();
  });

  it('seeds the five initial areas as active', async () => {
    const areas = await service.findAll();
    expect(areas.map((area) => area.nombre)).toEqual(INITIAL_AREA_NAMES);
    expect(areas.every((area) => area.activa)).toBe(true);
    expect(areas.every((area) => /^[0-9a-f-]{36}$/i.test(area.id))).toBe(true);
  });

  it('trims names and rejects duplicate names regardless of case', async () => {
    const area = await service.create({ nombre: '  Operaciones  ' });
    expect(area.nombre).toBe('Operaciones');
    await expect(service.create({ nombre: 'operaciones' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('filters by active state and supports changing an area without deleting it', async () => {
    const area = await service.create({ nombre: 'Monitoreo' });
    const updated = await service.update(area.id, { activa: false });

    expect(updated.activa).toBe(false);
    expect(await service.findById(area.id)).toEqual(updated);
    expect(await service.findAll(true)).not.toContainEqual(updated);
    expect(await service.findAll(false)).toContainEqual(updated);
  });

  it('rejects empty updates and name collisions', async () => {
    const first = await service.create({ nombre: 'Área Alfa' });
    const second = await service.create({ nombre: 'Área Beta' });

    await expect(service.update(first.id, {})).rejects.toThrow(
      'Debes indicar el nombre o el estado del área.',
    );
    await expect(
      service.update(second.id, { nombre: ' área alfa ' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns not found for missing ids', async () => {
    await expect(service.findById('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('prevents deactivation when an active category uses an area', async () => {
    const area = (await service.findAll())[0];
    await categories.create({
      nombre: 'Accesos y contraseñas',
      activa: true,
      areaSugeridaId: area.id,
    });

    await expect(service.update(area.id, { activa: false })).rejects.toThrow(
      'No se puede desactivar el área porque la usan estas categorías activas: Accesos y contraseñas. Reasígnalas primero.',
    );
    expect((await service.findById(area.id)).activa).toBe(true);
  });

  it('lists only active categories in the deactivation conflict message', async () => {
    const area = (await service.findAll())[0];
    await categories.create({
      nombre: 'Active category',
      activa: true,
      areaSugeridaId: area.id,
    });
    const inactiveCategory = await categories.create({
      nombre: 'Inactive category',
      activa: true,
      areaSugeridaId: area.id,
    });
    await categories.update(inactiveCategory.id, { activa: false });

    try {
      await service.update(area.id, { activa: false });
      throw new Error('Expected area deactivation to fail.');
    } catch (error) {
      expect((error as Error).message).toContain('Active category');
      expect((error as Error).message).not.toContain('Inactive category');
    }
  });

  it('allows deactivation after the category is deactivated', async () => {
    const area = (await service.findAll())[0];
    const category = await categories.create({
      nombre: 'Accesos y contraseñas',
      activa: true,
      areaSugeridaId: area.id,
    });
    await categories.update(category.id, { activa: false });

    expect((await service.update(area.id, { activa: false })).activa).toBe(false);
  });

  it('reports both active categories and active users when an area has both references', async () => {
    const area = await service.create({ nombre: 'Área con referencias mixtas' });
    await categories.create({
      nombre: 'Categoría activa',
      activa: true,
      areaSugeridaId: area.id,
    });
    await users.create({
      nombre: 'Usuario activo',
      correo: 'active@example.com',
      passwordHash: 'hash',
      rol: UserRole.AGENTE,
      areaId: area.id,
      activo: true,
    });

    await expect(service.update(area.id, { activa: false })).rejects.toThrow(
      'Categoría activa; además tiene 1 usuario(s) activo(s)',
    );
  });
});
