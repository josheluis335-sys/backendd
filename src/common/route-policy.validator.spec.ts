import { Get } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Public } from './decorators/public.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { UserRole } from './enums/user-role.enum.js';
import { RoutePolicyValidator } from './route-policy.validator.js';

describe('RoutePolicyValidator', () => {
  it('rejects a route that combines @Public() and @Roles()', () => {
    class ConflictingController {
      handler() {
        return undefined;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      ConflictingController.prototype,
      'handler',
    )!;
    Get()(ConflictingController.prototype, 'handler', descriptor);
    Public()(ConflictingController.prototype, 'handler', descriptor);
    Roles(UserRole.ADMINISTRADOR)(
      ConflictingController.prototype,
      'handler',
      descriptor,
    );

    const discovery = {
      getControllers: () => [{ metatype: ConflictingController }],
    } as unknown as DiscoveryService;
    const validator = new RoutePolicyValidator(discovery, new Reflector());

    expect(() => validator.onModuleInit()).toThrow(
      'no puede combinar @Public() y @Roles()',
    );
  });
});
