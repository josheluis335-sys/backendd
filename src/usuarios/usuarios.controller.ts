import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { DirectorioUsuariosDto } from './dto/directorio-usuarios.dto.js';
import { ListUsuariosDto } from './dto/list-usuarios.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';
import { WriteThrottleGuard } from './guards/write-throttle.guard.js';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get('directorio')
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar el directorio de usuarios activos' })
  directory(@Query() query: DirectorioUsuariosDto) {
    return this.usuariosService.directory(query);
  }

  @Get()
  @Roles(UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar usuarios con filtros y paginación' })
  list(@Query() query: ListUsuariosDto) {
    return this.usuariosService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar un usuario' })
  findById(@Param('id') id: string) {
    return this.usuariosService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMINISTRADOR)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Crear un usuario de soporte' })
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuariosService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMINISTRADOR)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Editar nombre, rol o área de un usuario' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.usuariosService.update(id, dto, request.user.id);
  }

  @Patch(':id/desactivar')
  @Roles(UserRole.ADMINISTRADOR)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Desactivar un usuario y cerrar sus sesiones' })
  deactivate(
    @Param('id') id: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.usuariosService.deactivate(id, request.user.id);
  }

  @Patch(':id/activar')
  @Roles(UserRole.ADMINISTRADOR)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Activar un usuario' })
  activate(@Param('id') id: string) {
    return this.usuariosService.activate(id);
  }

  @Post(':id/restablecer-password')
  @Roles(UserRole.ADMINISTRADOR)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Restablecer la contraseña y cerrar sesiones activas' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usuariosService.resetPassword(id, dto);
  }
}
