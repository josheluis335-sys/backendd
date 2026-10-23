import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { EscalamientosService } from './escalamientos.service.js';

@ApiTags('escalamientos')
@ApiBearerAuth()
@Controller('tickets/:id/escalamientos')
export class EscalamientosController {
  constructor(
    private readonly escalamientosService: EscalamientosService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Get()
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar el historial de escalamientos de un ticket visible' })
  async list(@Param('id') id: string, @Req() request: { user: TicketActor }) {
    await this.ticketsService.findVisibleById(id, request.user);
    return this.escalamientosService.listarPorTicket(id);
  }
}
