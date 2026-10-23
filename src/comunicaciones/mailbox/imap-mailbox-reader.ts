import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ClockService } from '../../common/clock/clock.service.js';
import type {
  MailboxMessage,
  MailboxReader,
} from '../interfaces/mailbox-reader.interface.js';

@Injectable()
export class ImapMailboxReader implements MailboxReader {
  constructor(
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  async readUnread(): Promise<MailboxMessage[]> {
    const client = new ImapFlow({
      host: this.config.getOrThrow<string>('IMAP_HOST'),
      port: this.config.getOrThrow<number>('IMAP_PORT'),
      secure: this.config.get<boolean>('IMAP_SECURE', false),
      auth: {
        user: this.config.getOrThrow<string>('IMAP_USER'),
        pass: this.config.getOrThrow<string>('IMAP_PASS'),
      },
      tls: { rejectUnauthorized: true },
      logger: false,
    });
    const messages: MailboxMessage[] = [];

    await client.connect();
    try {
      const lock = await client.getMailboxLock(
        this.config.get<string>('IMAP_MAILBOX', 'INBOX'),
      );
      try {
        const unread = await client.search({ seen: false }, { uid: true });
        if (!unread) return messages;
        for await (const item of client.fetch(
          unread,
          { uid: true, envelope: true, size: true, internalDate: true },
          { uid: true },
        )) {
          const envelope = item.envelope;
          const address = envelope?.from?.[0];
          const receivedAt =
            item.internalDate instanceof Date ? item.internalDate : this.clock.ahora();
          if (
            (item.size ?? 0) >
            this.config.get<number>('IMAP_MAX_BYTES_MENSAJE', 5_242_880)
          ) {
            messages.push({
              uid: String(item.uid),
              messageId: envelope?.messageId,
              remitenteNombre: address?.name ?? '',
              remitenteCorreo: address?.address ?? '',
              asunto: envelope?.subject ?? '',
              cuerpo: '',
              fechaRecepcion: receivedAt,
              tamanoExcedido: true,
            });
            continue;
          }
          for await (const sourceItem of client.fetch(
            item.uid,
            { uid: true, source: true },
            { uid: true },
          )) {
            if (!sourceItem.source) continue;
            const parsed = await simpleParser(sourceItem.source);
            const parsedAddresses = parsed.from?.value ?? [];
            const parsedAddress = parsedAddresses.length === 1 ? parsedAddresses[0] : undefined;
            const headers: Record<string, string | undefined> = {};
            for (const name of [
              'auto-submitted',
              'x-autoreply',
              'x-autorespond',
              'precedence',
              'list-id',
              'x-auto-response-suppress',
              'content-type',
              'return-path',
              'x-failed-recipients',
            ]) {
              const value = parsed.headers.get(name);
              headers[name] =
                typeof value === 'string'
                  ? value
                  : value !== undefined &&
                      typeof value === 'object' &&
                      'value' in value &&
                      typeof value.value === 'string'
                    ? value.value
                    : undefined;
            }
            messages.push({
              uid: String(sourceItem.uid),
              messageId: parsed.messageId,
              remitenteNombre: parsedAddress?.name ?? '',
              asunto: parsed.subject ?? '',
              cuerpo: parsed.text ?? '',
              fechaRecepcion: receivedAt,
              remitenteCorreo:
                parsedAddresses.length === 1 ? parsedAddress?.address ?? '' : '',
              fromMultipleOrInvalid: parsedAddresses.length !== 1 || !parsedAddress?.address,
              headers,
            });
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return messages;
  }

  async markAsRead(uid: string): Promise<void> {
    const client = new ImapFlow({
      host: this.config.getOrThrow<string>('IMAP_HOST'),
      port: this.config.getOrThrow<number>('IMAP_PORT'),
      secure: this.config.get<boolean>('IMAP_SECURE', false),
      auth: {
        user: this.config.getOrThrow<string>('IMAP_USER'),
        pass: this.config.getOrThrow<string>('IMAP_PASS'),
      },
      tls: { rejectUnauthorized: true },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(
        this.config.get<string>('IMAP_MAILBOX', 'INBOX'),
      );
      try {
        await client.messageFlagsAdd(Number(uid), ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }
}
