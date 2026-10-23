import { Module } from '@nestjs/common';
import { ClockModule } from '../common/clock/clock.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { COMUNICACIONES_REPOSITORY, MAILBOX_READER } from './comunicaciones.constants.js';
import { ComunicacionesController } from './comunicaciones.controller.js';
import { ComunicacionesJob } from './comunicaciones.job.js';
import { ComunicacionesService } from './comunicaciones.service.js';
import { InMemoryComunicacionesRepository } from './repositories/in-memory-comunicaciones.repository.js';
import { InMemoryMailboxReader } from './mailbox/in-memory-mailbox-reader.js';
import { ImapMailboxReader } from './mailbox/imap-mailbox-reader.js';

@Module({
  imports: [ClockModule, TicketsModule],
  controllers: [ComunicacionesController],
  providers: [
    InMemoryComunicacionesRepository,
    InMemoryMailboxReader,
    ImapMailboxReader,
    {
      provide: COMUNICACIONES_REPOSITORY,
      useExisting: InMemoryComunicacionesRepository,
    },
    {
      provide: MAILBOX_READER,
      inject: [InMemoryMailboxReader, ImapMailboxReader],
      useFactory: (inMemory: InMemoryMailboxReader, imap: ImapMailboxReader) =>
        process.env.NODE_ENV === 'test' ? inMemory : imap,
    },
    ComunicacionesService,
    ComunicacionesJob,
  ],
  exports: [ComunicacionesService, InMemoryMailboxReader],
})
export class ComunicacionesModule {}
