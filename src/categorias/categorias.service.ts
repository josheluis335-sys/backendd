import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AreasService } from '../areas/areas.service.js';
import { Categoria, CategoriaNameConflictError } from './entities/categoria.entity.js';
import { CATEGORIAS_REPOSITORY, INITIAL_CATEGORIES } from './categorias.constants.js';
import { CreateCategoriaDto } from './dto/create-categoria.dto.js';
import { UpdateCategoriaDto } from './dto/update-categoria.dto.js';
import type { CategoriasRepository } from './interfaces/categorias.repository.interface.js';

@Injectable()
export class CategoriasService implements OnModuleInit {
  constructor(
    @Inject(CATEGORIAS_REPOSITORY)
    private readonly categoriasRepository: CategoriasRepository,
    private readonly areasService: AreasService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedInitialAreasAndCategories();
  }

  async seedInitialAreasAndCategories(): Promise<void> {
    await this.areasService.seedInitialAreas();

    for (const initial of INITIAL_CATEGORIES) {
      const existing = await this.categoriasRepository.findByName(initial.nombre);
      const area = (await this.areasService.findAll()).find(
        (item) => item.nombre === initial.areaNombre,
      );
      if (!area || !area.activa) {
        throw new Error(
          `No se puede sembrar la categoría "${initial.nombre}": el área "${initial.areaNombre}" no existe o está inactiva.`,
        );
      }

      if (!existing) {
        await this.categoriasRepository.create({
          nombre: initial.nombre,
          activa: true,
          areaSugeridaId: area.id,
        });
      }
    }
  }

  async findAll(activa?: boolean): Promise<Categoria[]> {
    return this.categoriasRepository.findAll(activa);
  }

  async findById(id: string): Promise<Categoria> {
    const categoria = await this.categoriasRepository.findById(id);
    if (!categoria) {
      throw new NotFoundException('No se encontró la categoría solicitada.');
    }
    return categoria;
  }

  async create(dto: CreateCategoriaDto): Promise<Categoria> {
    const nombre = dto.nombre.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre de la categoría no puede estar vacío.');
    }
    if (await this.categoriasRepository.findByName(nombre)) {
      throw new ConflictException('Ya existe una categoría con ese nombre.');
    }
    await this.requireActiveArea(dto.areaSugeridaId);

    try {
      const categoria = await this.categoriasRepository.create({
        nombre,
        activa: true,
        areaSugeridaId: dto.areaSugeridaId,
      });
      return categoria;
    } catch (error) {
      if (error instanceof CategoriaNameConflictError) {
        throw new ConflictException('Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoriaDto): Promise<Categoria> {
    const current = await this.findById(id);
    if (
      dto.nombre === undefined &&
      dto.activa === undefined &&
      dto.areaSugeridaId === undefined
    ) {
      throw new BadRequestException(
        'Debes indicar el nombre, el estado o el área sugerida de la categoría.',
      );
    }
    if (dto.nombre !== undefined && !dto.nombre.trim()) {
      throw new BadRequestException('El nombre de la categoría no puede estar vacío.');
    }
    const areaSugeridaId = dto.areaSugeridaId ?? current.areaSugeridaId;
    if (dto.areaSugeridaId !== undefined || dto.activa === true) {
      await this.requireActiveArea(areaSugeridaId);
    }

    try {
      const updated = await this.categoriasRepository.update(id, {
        ...(dto.nombre === undefined ? {} : { nombre: dto.nombre.trim() }),
        ...(dto.activa === undefined ? {} : { activa: dto.activa }),
        ...(dto.areaSugeridaId === undefined
          ? {}
          : { areaSugeridaId: dto.areaSugeridaId }),
      });
      if (!updated) {
        throw new NotFoundException('No se encontró la categoría solicitada.');
      }
      // Catalogue changes affect newly created tickets only; historical ticket references remain unchanged.
      return updated;
    } catch (error) {
      if (error instanceof CategoriaNameConflictError) {
        throw new ConflictException('Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }

  async findSuggestedArea(
    id: string,
  ): Promise<{ id: string; nombre: string }> {
    const categoria = await this.findById(id);
    if (!categoria.activa) {
      throw new ConflictException(
        'No se puede consultar el área sugerida de una categoría inactiva.',
      );
    }
    const area = await this.areasService.findById(categoria.areaSugeridaId);
    if (!area.activa) {
      throw new ConflictException(
        'El área sugerida está inactiva y no puede utilizarse.',
      );
    }
    return { id: area.id, nombre: area.nombre };
  }

  private async requireActiveArea(areaId: string): Promise<void> {
    const area = await this.areasService.findById(areaId);
    if (!area.activa) {
      throw new ConflictException('El área sugerida debe estar activa.');
    }
  }

}
