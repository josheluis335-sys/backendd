import { Controller, Get } from '@nestjs/common';
import { Roles } from '../src/common/decorators/roles.decorator.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';

@Controller('test-auth')
export class TestAuthController {
  @Get('admin-only')
  @Roles(UserRole.ADMINISTRADOR)
  adminOnly() {
    return { ok: true };
  }

  @Get('internal-error')
  @Roles(UserRole.ADMINISTRADOR)
  internalError() {
    throw new Error(`error interno de prueba ${process.env.SMTP_PASS ?? ''}`);
  }
}
