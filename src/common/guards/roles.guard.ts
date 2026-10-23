import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums/user-role.enum.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../constants/roles.constant.js';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      this.logger.warn('Acceso denegado: ruta sin roles autorizados.');
      throw new ForbiddenException('La ruta no tiene roles autorizados.');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { rol?: UserRole } | undefined;

    if (!user?.rol || !requiredRoles.includes(user.rol)) {
      this.logger.warn('Acceso denegado por rol.');
      throw new ForbiddenException('No tienes permisos para realizar esta acción.');
    }

    return true;
  }
}
