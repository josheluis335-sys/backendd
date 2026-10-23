import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { AreasService } from '../areas/areas.service.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { DirectorioUsuariosDto } from './dto/directorio-usuarios.dto.js';
import { ListUsuariosDto } from './dto/list-usuarios.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import {
  UsuarioDirectorioResponseDto,
  UsuarioResponseDto,
} from './dto/usuario-response.dto.js';
import { Usuario, UsuarioEmailConflictError } from './entities/usuario.entity.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from './usuarios.constants.js';
import type { SessionsRepository } from './interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from './interfaces/usuarios.repository.interface.js';
import { validatePasswordPolicy } from './validation/password-policy.js';

export interface PaginatedUsuariosResponse {
  data: UsuarioResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class UsuariosService implements OnModuleInit {
  private administratorMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(USUARIOS_REPOSITORY)
    private readonly usuariosRepository: UsuariosRepository,
    @Inject(USUARIOS_SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    private readonly areasService: AreasService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedInitialUsers();
  }

  async seedInitialUsers(): Promise<void> {
    await this.areasService.seedInitialAreas();
    const areaName = this.configService.get<string>(
      'ADMIN_AREA_NOMBRE',
      'Seguridad y accesos',
    );
    const adminArea = (await this.areasService.findAll()).find(
      (area) => area.nombre.toLowerCase() === areaName.trim().toLowerCase(),
    );
    if (!adminArea || !adminArea.activa) {
      throw new Error(`El área inicial del administrador "${areaName}" no existe o está inactiva.`);
    }

    const adminEmail = this.normalizeEmail(this.configService.getOrThrow<string>('ADMIN_EMAIL'));
    const existingAdmin = await this.usuariosRepository.findByEmail(adminEmail);
    if (!existingAdmin) {
      await this.createSeedUser({
        nombre: this.configService.getOrThrow<string>('ADMIN_NAME'),
        correo: adminEmail,
        password: this.configService.getOrThrow<string>('ADMIN_PASSWORD'),
        rol: UserRole.ADMINISTRADOR,
        areaId: adminArea.id,
      });
    }

    if (this.configService.get<string>('NODE_ENV') === 'development') {
      await this.createDevelopmentUser(
        'DEV_AGENT_NAME',
        'DEV_AGENT_EMAIL',
        'DEV_AGENT_PASSWORD',
        UserRole.AGENTE,
        adminArea.id,
      );
      await this.createDevelopmentUser(
        'DEV_SUPERVISOR_NAME',
        'DEV_SUPERVISOR_EMAIL',
        'DEV_SUPERVISOR_PASSWORD',
        UserRole.SUPERVISOR,
        adminArea.id,
      );
    }
  }

  async list(dto: ListUsuariosDto): Promise<PaginatedUsuariosResponse> {
    const filters = { rol: dto.rol, areaId: dto.areaId, activo: dto.activo };
    const all = await this.usuariosRepository.list(filters);
    const start = (dto.page - 1) * dto.pageSize;
    return {
      data: all
        .slice(start, start + dto.pageSize)
        .map((user) => UsuarioResponseDto.fromEntity(user)),
      page: dto.page,
      pageSize: dto.pageSize,
      total: all.length,
    };
  }

  async findById(id: string): Promise<UsuarioResponseDto> {
    return UsuarioResponseDto.fromEntity(await this.requireUser(id));
  }

  async create(dto: CreateUsuarioDto): Promise<UsuarioResponseDto> {
    const nombre = dto.nombre.trim();
    const correo = this.normalizeEmail(dto.correo);
    if (await this.usuariosRepository.findByEmail(correo)) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }
    await this.requireActiveArea(dto.areaId);
    try {
      const usuario = await this.usuariosRepository.create({
        nombre,
        correo,
        passwordHash: await this.hashPassword(dto.password),
        rol: dto.rol,
        areaId: dto.areaId,
        activo: true,
      });
      return UsuarioResponseDto.fromEntity(usuario);
    } catch (error) {
      if (error instanceof UsuarioEmailConflictError) {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateUsuarioDto,
    actorId: string,
  ): Promise<UsuarioResponseDto> {
    return this.withAdministratorMutation(async () => {
      const current = await this.requireUser(id);
      if (
        dto.nombre === undefined &&
        dto.rol === undefined &&
        dto.areaId === undefined
      ) {
        throw new BadRequestException('Debes indicar nombre, rol o área.');
      }
      if (dto.rol !== undefined && actorId === id && dto.rol !== current.rol) {
        throw new ConflictException('No puedes cambiar tu propio rol.');
      }
      if (
        current.activo &&
        current.rol === UserRole.ADMINISTRADOR &&
        dto.rol !== undefined &&
        dto.rol !== UserRole.ADMINISTRADOR &&
        (await this.usuariosRepository.countActiveAdministrators()) <= 1
      ) {
        throw new ConflictException('No se puede degradar al último administrador activo.');
      }
      if (dto.areaId !== undefined) {
        await this.requireActiveArea(dto.areaId);
      }

      const roleChanged = dto.rol !== undefined && dto.rol !== current.rol;
      const areaChanged = dto.areaId !== undefined && dto.areaId !== current.areaId;
      const updated = await this.usuariosRepository.update(id, {
        ...(dto.nombre === undefined ? {} : { nombre: dto.nombre.trim() }),
        ...(dto.rol === undefined ? {} : { rol: dto.rol }),
        ...(dto.areaId === undefined ? {} : { areaId: dto.areaId }),
      });
      if (!updated) {
        throw new NotFoundException('No se encontró el usuario solicitado.');
      }
      if (roleChanged || areaChanged) {
        await this.sessionsRepository.removeByUserId(id);
      }
      return UsuarioResponseDto.fromEntity(updated);
    });
  }

  async deactivate(id: string, actorId: string): Promise<UsuarioResponseDto> {
    return this.withAdministratorMutation(async () => {
      const user = await this.requireUser(id);
      if (actorId === id) {
        throw new ConflictException('No puedes desactivar tu propia cuenta.');
      }
      await this.assertNotLastAdministrator(user);
      const updated = await this.usuariosRepository.update(id, { activo: false });
      if (!updated) {
        throw new NotFoundException('No se encontró el usuario solicitado.');
      }
      await this.sessionsRepository.removeByUserId(id);
      return UsuarioResponseDto.fromEntity(updated);
    });
  }

  async activate(id: string): Promise<UsuarioResponseDto> {
    const user = await this.requireUser(id);
    await this.requireActiveArea(user.areaId);
    const updated = await this.usuariosRepository.update(id, { activo: true });
    if (!updated) {
      throw new NotFoundException('No se encontró el usuario solicitado.');
    }
    return UsuarioResponseDto.fromEntity(updated);
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
  ): Promise<{ mensaje: string }> {
    await this.requireUser(id);
    const updated = await this.usuariosRepository.update(id, {
      passwordHash: await this.hashPassword(dto.password),
    });
    if (!updated) {
      throw new NotFoundException('No se encontró el usuario solicitado.');
    }
    await this.sessionsRepository.removeByUserId(id);
    return { mensaje: 'La contraseña fue restablecida y las sesiones anteriores se cerraron.' };
  }

  async directory(
    dto: DirectorioUsuariosDto,
  ): Promise<UsuarioDirectorioResponseDto[]> {
    const users = await this.usuariosRepository.list({
      activo: true,
      areaId: dto.areaId,
    });
    const result: UsuarioDirectorioResponseDto[] = [];
    for (const user of users) {
      const area = await this.areasService.findById(user.areaId);
      result.push({
        id: user.id,
        nombre: user.nombre,
        rol: user.rol,
        area: { id: area.id, nombre: area.nombre },
      });
    }
    return result;
  }

  private async requireUser(id: string): Promise<Usuario> {
    const user = await this.usuariosRepository.findById(id);
    if (!user) {
      throw new NotFoundException('No se encontró el usuario solicitado.');
    }
    return user;
  }

  private async requireActiveArea(areaId: string): Promise<void> {
    const area = await this.areasService.findById(areaId);
    if (!area.activa) {
      throw new ConflictException('El área del usuario debe estar activa.');
    }
  }

  private async assertNotLastAdministrator(user: Usuario): Promise<void> {
    if (
      user.activo &&
      user.rol === UserRole.ADMINISTRADOR
    ) {
      if ((await this.usuariosRepository.countActiveAdministrators()) <= 1) {
        throw new ConflictException('No se puede desactivar al último administrador activo.');
      }
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const errors = validatePasswordPolicy(password);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    return bcrypt.hash(password, 10);
  }

  private async createSeedUser(options: {
    nombre: string;
    correo: string;
    password: string;
    rol: UserRole.AGENTE | UserRole.SUPERVISOR | UserRole.ADMINISTRADOR;
    areaId: string;
  }): Promise<Usuario> {
    const errors = validatePasswordPolicy(options.password);
    if (errors.length > 0) {
      throw new Error(`La contraseña de seed no cumple la política: ${errors.join(' ')}`);
    }
    return this.usuariosRepository.create({
      nombre: options.nombre.trim(),
      correo: this.normalizeEmail(options.correo),
      passwordHash: await bcrypt.hash(options.password, 10),
      rol: options.rol,
      areaId: options.areaId,
      activo: true,
    });
  }

  private async createDevelopmentUser(
    nameKey: string,
    emailKey: string,
    passwordKey: string,
    role: UserRole.AGENTE | UserRole.SUPERVISOR,
    areaId: string,
  ): Promise<Usuario> {
    const correo = this.normalizeEmail(this.configService.getOrThrow<string>(emailKey));
    const existing = await this.usuariosRepository.findByEmail(correo);
    if (existing) {
      return existing;
    }
    return this.createSeedUser({
      nombre: this.configService.getOrThrow<string>(nameKey),
      correo,
      password: this.configService.getOrThrow<string>(passwordKey),
      rol: role,
      areaId,
    });
  }

  private normalizeEmail(correo: string): string {
    return correo.trim().toLowerCase();
  }

  private async withAdministratorMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.administratorMutationQueue;
    let release!: () => void;
    this.administratorMutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

}
