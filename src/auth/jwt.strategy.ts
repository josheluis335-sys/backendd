import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { USUARIOS_REPOSITORY } from '../usuarios/usuarios.constants.js';
import type { UserRole } from '../common/enums/user-role.enum.js';
import { AuthService } from './auth.service.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';

export interface JwtPayload {
  sub: string;
  sid: string;
  correo: string;
  rol: UserRole;
  areaId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(USUARIOS_REPOSITORY)
    private readonly usersRepository: UsuariosRepository,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersRepository.findById(payload.sub);

    if (
      !user ||
      !user.activo ||
      !(await this.authService.validateSession(payload.sub, payload.sid))
    ) {
      throw new UnauthorizedException('La sesión no es válida o ha caducado.');
    }

    return {
      id: user.id,
      sessionId: payload.sid,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
      areaId: user.areaId ?? null,
    };
  }
}
