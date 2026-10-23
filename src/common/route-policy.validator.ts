import { Injectable, OnModuleInit } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from './constants/roles.constant.js';

@Injectable()
export class RoutePolicyValidator implements OnModuleInit {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discoveryService.getControllers()) {
      const controller = wrapper.metatype;
      if (!controller) {
        continue;
      }

      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
          continue;
        }

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          handler,
          controller,
        ]);
        const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
          handler,
          controller,
        ]);

        if (isPublic && roles !== undefined) {
          throw new Error(
            `La ruta ${controller.name}.${name} no puede combinar @Public() y @Roles().`,
          );
        }
        if (!isPublic && (!roles || roles.length === 0)) {
          throw new Error(
            `La ruta ${controller.name}.${name} debe declarar @Public() o @Roles().`,
          );
        }
      }
    }
  }
}
