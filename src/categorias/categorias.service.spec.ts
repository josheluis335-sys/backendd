import { ConflictException, NotFoundException } from '@nestjs/common';
import { AreasService } from '../areas/areas.service.js';
import { InMemoryAreasRepository } from '../areas/repositories/in-memory-areas.repository.js';
import { InMemoryUsuariosRepository } from '../usuarios/repositories/in-memory-usuarios.repository.js';
import { CategoriasService } from './categorias.service.js';
import { INITIAL_CATEGORIES } from './categorias.constants.js';
import { InMemoryCategoriasRepository } from './repositories/in-memory-categorias.repository.js';

describe('CategoriasService', () => {
  let areaRepository: InMemoryAreasRepository;
  let areasService: AreasService;
  let categoryRepository: InMemoryCategoriasRepository;
  let service: CategoriasService;

  beforeEach(async () => {
    areaRepository = new InMemoryAreasRepository();
    categoryRepository = new InMemoryCategoriasRepository();
    areasService = new AreasService(
      areaRepository,
      categoryRepository,
      new InMemoryUsuariosRepository(),
    );
    service = new CategoriasService(categoryRepository, areasService);
    await areasService.seedInitialAreas();
    await service.onModuleInit();
  });

  it('seeds six categories only after areas are seeded and each has one suggested area', async () => {
    const categories = await service.findAll();
    expect(categories).toHaveLength(6);
    expect(categories.map(({ nombre }) => nombre)).toEqual(
      INITIAL_CATEGORIES.map(({ nombre }) => nombre),
    );
    expect(categories.every((category) => category.activa && category.areaSugeridaId)).toBe(
      true,
    );
  });

  it('trims names and rejects duplicates without case sensitivity', async () => {
    const area = (await areasService.findAll())[0];
    const category = await service.create({
      nombre: '  Cuentas  ',
      areaSugeridaId: area.id,
    });
    expect(category.nombre).toBe('Cuentas');
    await expect(
      service.create({ nombre: 'cuentas', areaSugeridaId: area.id }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects nonexistent and inactive suggested areas', async () => {
    await expect(
      service.create({
        nombre: 'Sin área',
        areaSugeridaId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const area = await areasService.create({ nombre: 'Área temporal' });
    await areasService.update(area.id, { activa: false });
    await expect(
      service.create({ nombre: 'Área fuera de servicio', areaSugeridaId: area.id }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a conflict if the category or its suggested area is inactive', async () => {
    const seeded = (await service.findAll())[0];
    await service.update(seeded.id, { activa: false });
    await expect(service.findSuggestedArea(seeded.id)).rejects.toThrow(
      'No se puede consultar el área sugerida de una categoría inactiva.',
    );

    await service.update(seeded.id, { activa: true });
    const area = await areasService.findById(seeded.areaSugeridaId);
    await areaRepository.update(area.id, { activa: false });
    await expect(service.findSuggestedArea(seeded.id)).rejects.toThrow(
      'El área sugerida está inactiva y no puede utilizarse.',
    );
  });

  it('queries active categories directly when checking area deactivation', async () => {
    const seeded = (await service.findAll())[0];
    const areas = await areasService.findAll(true);
    await expect(areasService.update(seeded.areaSugeridaId, { activa: false })).rejects.toBeInstanceOf(
      ConflictException,
    );

    await service.update(seeded.id, { areaSugeridaId: areas[1].id });
    expect((await areasService.update(seeded.areaSugeridaId, { activa: false })).activa).toBe(
      false,
    );
  });

  it('tracks active category area usage through repository queries across state changes', async () => {
    const firstArea = await areasService.create({ nombre: 'Reference area one' });
    const secondArea = await areasService.create({ nombre: 'Reference area two' });
    const category = await service.create({
      nombre: 'Reference lifecycle',
      areaSugeridaId: firstArea.id,
    });
    await expect(
      areasService.update(firstArea.id, { activa: false }),
    ).rejects.toThrow('Reference lifecycle');

    await service.update(category.id, { areaSugeridaId: secondArea.id });
    expect((await areasService.update(firstArea.id, { activa: false })).activa).toBe(
      false,
    );
    await expect(
      areasService.update(secondArea.id, { activa: false }),
    ).rejects.toThrow('Reference lifecycle');

    await service.update(category.id, { activa: false });
    expect((await areasService.update(secondArea.id, { activa: false })).activa).toBe(
      false,
    );
  });

  it('requires an active suggested area when reactivating a category', async () => {
    const category = (await service.findAll())[0];
    const area = await areasService.findById(category.areaSugeridaId);
    await service.update(category.id, { activa: false });
    await areasService.update(area.id, { activa: false });

    await expect(service.update(category.id, { activa: true })).rejects.toThrow(
      'El área sugerida debe estar activa.',
    );
  });
});
