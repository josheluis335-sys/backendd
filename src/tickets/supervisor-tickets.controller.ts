import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { ListSupervisorTicketsDto } from './dto/list-supervisor-tickets.dto.js';
import type { TicketActor } from './policy/ticket-visibility.policy.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('supervisor')
@ApiBearerAuth()
@Controller('supervisor/tickets')
export class SupervisorTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Consultar tickets visibles para el supervisor, con SLA e historial' })
  list(
    @Query() query: ListSupervisorTicketsDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.ticketsService.listForSupervisor(query, request.user);
  }
}
