import { Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller.js';
import { BitacoraService } from './bitacora.service.js';
import { TicketVisibilityPolicy } from '../tickets/policy/ticket-visibility.policy.js';
import { EscalamientosModule } from '../escalamientos/escalamientos.module.js';

@Module({
  imports: [EscalamientosModule],
  controllers: [BitacoraController],
  providers: [BitacoraService, TicketVisibilityPolicy],
  exports: [BitacoraService],
})
export class BitacoraModule {}
