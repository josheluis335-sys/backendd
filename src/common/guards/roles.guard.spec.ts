import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants/roles.constant.js';
import { UserRole } from '../enums/user-role.enum.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard security logging', () => {
  it('logs a generic role denial without user data', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [UserRole.ADMINISTRADOR], handler);
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'private-user-id', correo: 'private@example.com', rol: UserRole.AGENTE },
        }),
      }),
    };
    const loggerSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      expect(() => new RolesGuard(new Reflector()).canActivate(context as never)).toThrow(
        ForbiddenException,
      );
      const output = loggerSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Acceso denegado por rol.');
      expect(output).not.toContain('private-user-id');
      expect(output).not.toContain('private@example.com');
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
