import { Injectable } from '@nestjs/common';
import type { MailMessage, MailerResult, MailerService } from '../interfaces/mailer.interface.js';

@Injectable()
export class InMemoryMailer implements MailerService {
  private readonly sent: MailMessage[] = [];
  private nextError: Error | null = null;

  async enviar(message: MailMessage): Promise<MailerResult> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    this.sent.push(structuredClone(message));
    return { accepted: true };
  }

  bandeja(): MailMessage[] {
    return structuredClone(this.sent);
  }

  limpiar(): void {
    this.sent.length = 0;
  }

  fallarSiguiente(error = new Error('Error de envío simulado.')): void {
    this.nextError = error;
  }
}
