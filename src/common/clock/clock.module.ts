import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock.service.js';
import { TicketActionUnitOfWork } from './ticket-action-unit-of-work.js';

@Global()
@Module({
  providers: [ClockService, TicketActionUnitOfWork],
  exports: [ClockService, TicketActionUnitOfWork],
})
export class ClockModule {}
