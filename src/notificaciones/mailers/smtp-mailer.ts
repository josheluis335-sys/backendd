import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { MailMessage, MailerResult, MailerService } from '../interfaces/mailer.interface.js';

@Injectable()
export class SmtpMailer implements MailerService {
  private transporter: Transporter | undefined;

  constructor(private readonly config: ConfigService) {}

  async enviar(message: MailMessage): Promise<MailerResult> {
    const result = await this.getTransporter().sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: message.para,
      subject: message.asunto,
      text: message.texto,
      html: message.html,
      headers: {
        ...message.headers,
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
      },
    });
    return { accepted: (result.accepted?.length ?? 0) > 0 };
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const secure = this.config.get<boolean>('SMTP_SECURE', false);
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.getOrThrow<number>('SMTP_PORT'),
      secure,
      requireTLS: !secure,
      tls: { rejectUnauthorized: true },
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASS'),
      },
      connectionTimeout: this.config.get<number>('MAIL_TIMEOUT_MS', 5000),
      greetingTimeout: this.config.get<number>('MAIL_TIMEOUT_MS', 5000),
      socketTimeout: this.config.get<number>('MAIL_TIMEOUT_MS', 5000),
    });
    return this.transporter;
  }
}
