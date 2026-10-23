import nodemailer from 'nodemailer';
import { SmtpMailer } from './smtp-mailer.js';

describe('SmtpMailer', () => {
  it('sends fixed automatic headers to a plain recipient without CC, BCC, or Reply-To', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ['solicitante@example.com'] });
    const createTransport = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as never);
    const config = {
      getOrThrow: (key: string) =>
        ({
          MAIL_FROM: 'no-reply@example.com',
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: 587,
          SMTP_USER: 'mailer',
          SMTP_PASS: 'mail-secret',
        })[key],
      get: (key: string, fallback?: unknown) =>
        key === 'SMTP_SECURE' ? false : fallback,
    };
    const mailer = new SmtpMailer(config as never);

    try {
      await mailer.enviar({
        para: 'solicitante@example.com',
        asunto: 'Aviso',
        texto: 'Texto',
        html: '<p>Texto</p>',
        headers: {
          'Auto-Submitted': 'user-controlled-value',
          'X-Auto-Response-Suppress': 'none',
        },
      });
      const options = sendMail.mock.calls[0][0];
      expect(options).toMatchObject({
        to: 'solicitante@example.com',
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
        },
      });
      expect(options).not.toHaveProperty('cc');
      expect(options).not.toHaveProperty('bcc');
      expect(options).not.toHaveProperty('replyTo');
    } finally {
      createTransport.mockRestore();
    }
  });
});
