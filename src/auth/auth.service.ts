import {
  Inject,
  Injectable,
  Optional,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import {
  USUARIOS_REPOSITORY,
  USUARIOS_SESSIONS_REPOSITORY,
} from '../usuarios/usuarios.constants.js';
import type { Usuario, UsuarioPublico } from '../usuarios/entities/usuario.entity.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';
import type { SessionsRepository } from '../usuarios/interfaces/sessions.repository.interface.js';
import type { Session } from '../usuarios/entities/session.entity.js';
import { ClockService } from '../common/clock/clock.service.js';

export interface AuthResponse {
  access_token: string;
  user: UsuarioPublico;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(USUARIOS_REPOSITORY)
    private readonly usersRepository: UsuariosRepository,
    private readonly jwtService: JwtService,
    @Inject(USUARIOS_SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Optional()
    @Inject(ClockService)
    private readonly clock = new ClockService(),
  ) {}

  async validateUser(correo: string, password: string): Promise<Usuario | null> {
    const user = await this.usersRepository.findByEmail(correo);

    const passwordHash =
      user?.passwordHash ??
      '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!user || !user.activo || !isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(correo: string, password: string): Promise<AuthResponse> {
    const user = await this.validateUser(correo, password);

    if (!user) {
      this.logger.warn('Inicio de sesión fallido.');
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.logger.log(`Inicio de sesión exitoso. Usuario: ${user.id}`);

    const session: Session = {
      id: randomUUID(),
      usuarioId: user.id,
      ultimaActividad: this.clock.ahora(),
    };
    await this.sessionsRepository.create(session);

    const payload = {
      sub: user.id,
      sid: session.id,
      correo: user.correo,
      rol: user.rol,
      areaId: user.areaId ?? null,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: this.toPublicUser(user),
    };
  }

  async validateSession(userId: string, sessionId: string): Promise<boolean> {
    const session = await this.sessionsRepository.findById(sessionId);
    if (!session || session.usuarioId !== userId) {
      return false;
    }
    const now = this.clock.ahora();
    if (now.getTime() - session.ultimaActividad.getTime() >= 30 * 60 * 1000) {
      await this.sessionsRepository.remove(sessionId);
      this.logger.warn('Sesión caducada por inactividad.');
      return false;
    }
    await this.sessionsRepository.updateActivity(sessionId, now);
    return true;
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionsRepository.remove(sessionId);
  }

  async getProfile(
    user: Pick<UsuarioPublico, 'id' | 'nombre' | 'correo' | 'rol' | 'areaId' | 'activo'>,
  ): Promise<typeof user> {
    return user;
  }

  private toPublicUser(user: Usuario): UsuarioPublico {
    return {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
      areaId: user.areaId,
      activo: user.activo,
      fechaCreacion: user.fechaCreacion,
      fechaActualizacion: user.fechaActualizacion,
    };
  }
}
