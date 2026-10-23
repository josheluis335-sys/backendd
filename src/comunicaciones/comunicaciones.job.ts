import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ComunicacionesService } from './comunicaciones.service.js';
import { MAILBOX_READER } from './comunicaciones.constants.js';
import { Inject } from '@nestjs/common';
import type { MailboxReader } from './interfaces/mailbox-reader.interface.js';

@Injectable()
export class ComunicacionesJob implements OnApplicationShutdown {
  private readonly logger = new Logger(ComunicacionesJob.name);
  private activeRun: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(MAILBOX_READER) private readonly reader: MailboxReader,
    private readonly service: ComunicacionesService,
  ) {}

  @Interval(60_000)
  async procesarBandeja(): Promise<void> {
    if (this.activeRun || this.shuttingDown) return;
    const currentRun = this.runCycle();
    this.activeRun = currentRun;
    try {
      await currentRun;
    } finally {
      if (this.activeRun === currentRun) this.activeRun = undefined;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.activeRun;
  }

  private async runCycle(): Promise<void> {
    try {
      const unread = await this.reader.readUnread();
      for (const message of unread) {
        try {
          const stored = await this.service.recibir(message);
          if (stored) await this.reader.markAsRead(message.uid);
        } catch {
          this.logger.error('No se pudo procesar un correo entrante; se reintentará en el siguiente ciclo.');
        }
      }
    } catch {
      this.logger.error('No se pudo consultar el buzón IMAP.');
    }
  }
}
