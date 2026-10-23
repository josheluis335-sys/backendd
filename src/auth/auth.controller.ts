import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { AnyRole } from '../common/decorators/roles.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleGuard } from './guards/login-throttle.guard.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';
import type { UserRole } from '../common/enums/user-role.enum.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @UseGuards(LoginThrottleGuard)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.correo, dto.password);
  }

  @Get('me')
  @AnyRole()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  async profile(@Req() req: {
    user: {
      id: string;
      nombre: string;
      correo: string;
      rol: Exclude<UserRole, UserRole.SOLICITANTE>;
      areaId: string;
      activo: boolean;
    };
  }) {
    return this.authService.getProfile(req.user);
  }

  @Post('logout')
  @AnyRole()
  @UseGuards(WriteThrottleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar la sesión actual' })
  async logout(@Req() req: { user: { sessionId: string } }) {
    await this.authService.logout(req.user.sessionId);
    return { mensaje: 'Sesión cerrada.' };
  }
}
