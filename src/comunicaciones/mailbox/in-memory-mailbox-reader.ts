import { Injectable } from '@nestjs/common';
import type {
  MailboxMessage,
  MailboxReader,
} from '../interfaces/mailbox-reader.interface.js';

@Injectable()
export class InMemoryMailboxReader implements MailboxReader {
  private readonly pending = new Map<string, MailboxMessage>();

  async readUnread(): Promise<MailboxMessage[]> {
    return Array.from(this.pending.values(), (message) => structuredClone(message));
  }

  async markAsRead(uid: string): Promise<void> {
    this.pending.delete(uid);
  }

  agregar(message: MailboxMessage): void {
    this.pending.set(message.uid, structuredClone(message));
  }

  pendientes(): MailboxMessage[] {
    return Array.from(this.pending.values(), (message) => structuredClone(message));
  }
}
