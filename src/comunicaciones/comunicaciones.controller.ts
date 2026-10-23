import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { ConvertirComunicacionDto } from './dto/convertir-comunicacion.dto.js';
import { ListComunicacionesDto } from './dto/list-comunicaciones.dto.js';
import { ComunicacionesService } from './comunicaciones.service.js';

@ApiTags('comunicaciones')
@ApiBearerAuth()
@Controller('comunicaciones')
@Roles(UserRole.AGENTE)
export class ComunicacionesController {
  constructor(private readonly service: ComunicacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar correos recibidos' })
  listar(@Query() query: ListComunicacionesDto) {
    return this.service.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un correo recibido' })
  detalle(@Param('id') id: string) {
    return this.service.detalle(id);
  }

  @Post(':id/convertir')
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Convertir un correo en ticket' })
  convertir(
    @Param('id') id: string,
    @Body() dto: ConvertirComunicacionDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.service.convertir(id, dto, request.user);
  }
}
