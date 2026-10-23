import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClockModule } from '../common/clock/clock.module.js';
import { PUBLIC_ATTEMPTS_STORE, PUBLIC_EMAIL_COMPARATOR, PUBLIC_TICKET_LOOKUP } from './publico.constants.js';
import { PublicoController } from './publico.controller.js';
import { InMemoryPublicAttemptsStore } from './public-attempts.store.js';
import { RepositoryPublicTicketLookup } from './public-ticket-lookup.js';
import { compareEmailConstantTime, PublicoService } from './publico.service.js';

@Module({
  imports: [
    ClockModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 30 }]),
  ],
  controllers: [PublicoController],
  providers: [
    InMemoryPublicAttemptsStore,
    RepositoryPublicTicketLookup,
    { provide: PUBLIC_ATTEMPTS_STORE, useExisting: InMemoryPublicAttemptsStore },
    { provide: PUBLIC_TICKET_LOOKUP, useExisting: RepositoryPublicTicketLookup },
    { provide: PUBLIC_EMAIL_COMPARATOR, useValue: compareEmailConstantTime },
    PublicoService,
  ],
  exports: [PUBLIC_ATTEMPTS_STORE],
})
export class PublicoModule {}
