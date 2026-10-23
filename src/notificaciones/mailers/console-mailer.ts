import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailerResult, MailerService } from '../interfaces/mailer.interface.js';

@Injectable()
export class ConsoleMailer implements MailerService {
  private readonly logger = new Logger(ConsoleMailer.name);

  async enviar(message: MailMessage): Promise<MailerResult> {
    const parsed = message.asunto.match(/Ticket ((?:INC|REQ)\d{4,})/);
    const numero = parsed?.[1] ?? 'número-no-válido';
    const tipo = numero.slice(0, 3);
    this.logger.log(`Correo de prueba. tipo=${tipo} numero=${numero}`);
    return { accepted: true };
  }
}
