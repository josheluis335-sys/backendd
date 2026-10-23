import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { CreateAnotacionDto } from './dto/create-anotacion.dto.js';
import { ListAnotacionesDto } from './dto/list-anotaciones.dto.js';
import { AnotacionesService } from './anotaciones.service.js';

@ApiTags('anotaciones')
@ApiBearerAuth()
@Controller('tickets/:id/anotaciones')
export class AnotacionesController {
  constructor(private readonly service: AnotacionesService) {}

  @Post()
  @Roles(UserRole.AGENTE)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Agregar una anotación interna al ticket' })
  create(
    @Param('id') id: string,
    @Body() dto: CreateAnotacionDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.service.create(id, dto.texto, request.user);
  }

  @Get()
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar anotaciones de un ticket visible' })
  list(
    @Param('id') id: string,
    @Query() pagination: ListAnotacionesDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.service.list(id, request.user, pagination);
  }
}
