import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AREAS_REPOSITORY, INITIAL_AREA_NAMES } from './areas.constants.js';
import { CreateAreaDto } from './dto/create-area.dto.js';
import { UpdateAreaDto } from './dto/update-area.dto.js';
import { Area, AreaNameConflictError } from './entities/area.entity.js';
import type { AreasRepository } from './interfaces/areas.repository.interface.js';
import { CATEGORIAS_REPOSITORY } from '../categorias/categorias.constants.js';
import type { CategoriasRepository } from '../categorias/interfaces/categorias.repository.interface.js';
import { USUARIOS_REPOSITORY } from '../usuarios/usuarios.constants.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';

@Injectable()
export class AreasService implements OnModuleInit {
  constructor(
    @Inject(AREAS_REPOSITORY)
    private readonly areasRepository: AreasRepository,
    @Inject(CATEGORIAS_REPOSITORY)
    private readonly categoriasRepository: CategoriasRepository,
    @Inject(USUARIOS_REPOSITORY)
    private readonly usuariosRepository: UsuariosRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedInitialAreas();
  }

  async seedInitialAreas(): Promise<void> {
    for (const nombre of INITIAL_AREA_NAMES) {
      if (!(await this.areasRepository.findByName(nombre))) {
        await this.areasRepository.create({ nombre, activa: true });
      }
    }
  }

  async findAll(activa?: boolean): Promise<Area[]> {
    return this.areasRepository.findAll(activa);
  }

  async findById(id: string): Promise<Area> {
    const area = await this.areasRepository.findById(id);
    if (!area) {
      throw new NotFoundException('No se encontró el área solicitada.');
    }
    return area;
  }

  async create(dto: CreateAreaDto): Promise<Area> {
    const nombre = dto.nombre.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre del área no puede estar vacío.');
    }
    if (await this.areasRepository.findByName(nombre)) {
      throw new ConflictException('Ya existe un área con ese nombre.');
    }

    try {
      return await this.areasRepository.create({ nombre, activa: true });
    } catch (error) {
      if (error instanceof AreaNameConflictError) {
        throw new ConflictException('Ya existe un área con ese nombre.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateAreaDto): Promise<Area> {
    await this.findById(id);
    if (dto.nombre === undefined && dto.activa === undefined) {
      throw new BadRequestException('Debes indicar el nombre o el estado del área.');
    }
    if (dto.nombre !== undefined && !dto.nombre.trim()) {
      throw new BadRequestException('El nombre del área no puede estar vacío.');
    }
    if (dto.activa === false) {
      const categories = await this.categoriasRepository.findActiveByAreaId(id);
      const activeUserCount = await this.usuariosRepository.countActiveByAreaId(id);
      if (categories.length > 0 && activeUserCount > 0) {
        const names = categories.map((category) => category.nombre).join(', ');
        throw new ConflictException(
          `No se puede desactivar el área porque la usan estas categorías activas: ${names}; además tiene ${activeUserCount} usuario(s) activo(s). Reasigna las referencias primero.`,
        );
      }
      if (categories.length > 0) {
        const names = categories.map((category) => category.nombre).join(', ');
        throw new ConflictException(
          `No se puede desactivar el área porque la usan estas categorías activas: ${names}. Reasígnalas primero.`,
        );
      }
      if (activeUserCount > 0) {
        throw new ConflictException(
          `No se puede desactivar el área porque tiene ${activeUserCount} usuario(s) activo(s). Reasígnalos primero.`,
        );
      }
    }

    try {
      const updated = await this.areasRepository.update(id, {
        ...(dto.nombre === undefined ? {} : { nombre: dto.nombre.trim() }),
        ...(dto.activa === undefined ? {} : { activa: dto.activa }),
      });
      if (!updated) {
        throw new NotFoundException('No se encontró el área solicitada.');
      }
      return updated;
    } catch (error) {
      if (error instanceof AreaNameConflictError) {
        throw new ConflictException('Ya existe un área con ese nombre.');
      }
      throw error;
    }
  }
}
