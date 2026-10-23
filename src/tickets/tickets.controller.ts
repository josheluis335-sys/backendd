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
import { UserRole } from '../common/enums/user-role.enum.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsDto } from './dto/list-tickets.dto.js';
import { CloseTicketDto, PauseTicketDto } from './dto/ticket-actions.dto.js';
import { EscalarTicketDto } from '../escalamientos/dto/escalar-ticket.dto.js';
import { TicketActor } from './policy/ticket-visibility.policy.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Roles(UserRole.AGENTE)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Crear un ticket' })
  create(@Body() dto: CreateTicketDto, @Req() request: { user: TicketActor }) {
    return this.ticketsService.create(dto, request.user);
  }

  @Get()
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar tickets visibles con filtros y paginación' })
  list(@Query() query: ListTicketsDto, @Req() request: { user: TicketActor }) {
    return this.ticketsService.list(query, request.user);
  }

  @Get(':id')
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar un ticket visible' })
  findById(@Param('id') id: string, @Req() request: { user: TicketActor }) {
    return this.ticketsService.findVisibleWithSla(id, request.user);
  }

  @Post(':id/escalar')
  @Roles(UserRole.AGENTE)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Escalar o reasignar un ticket' })
  escalate(
    @Param('id') id: string,
    @Body() dto: EscalarTicketDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.ticketsService.escalate(id, dto, request.user);
  }

  @Post(':id/pausar')
  @Roles(UserRole.AGENTE)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Pausar un ticket' })
  pause(
    @Param('id') id: string,
    @Body() dto: PauseTicketDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.ticketsService.pause(id, dto, request.user);
  }

  @Post(':id/reanudar')
  @Roles(UserRole.AGENTE)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Reanudar un ticket' })
  resume(@Param('id') id: string, @Req() request: { user: TicketActor }) {
    return this.ticketsService.resume(id, request.user);
  }

  @Post(':id/cerrar')
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR)
  @UseGuards(WriteThrottleGuard)
  @ApiOperation({ summary: 'Cerrar un ticket' })
  close(
    @Param('id') id: string,
    @Body() dto: CloseTicketDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.ticketsService.close(id, dto, request.user);
  }
}
