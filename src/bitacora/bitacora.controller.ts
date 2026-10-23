import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { ListBitacoraDto } from './dto/list-bitacora.dto.js';
import { BitacoraService } from './bitacora.service.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';

@ApiTags('bitacora')
@ApiBearerAuth()
@Controller('tickets/:id/bitacora')
export class BitacoraController {
  constructor(private readonly bitacoraService: BitacoraService) {}

  @Get()
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar la bitácora de un ticket visible' })
  list(
    @Param('id') id: string,
    @Query() query: ListBitacoraDto,
    @Req() request: { user: TicketActor },
  ) {
    return this.bitacoraService.listarVisiblePorTicket(id, request.user, query);
  }
}
