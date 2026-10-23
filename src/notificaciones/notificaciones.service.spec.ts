import { Logger } from '@nestjs/common';
import { EventoBitacoraTipo } from '../bitacora/entities/evento-bitacora.entity.js';
import type { Ticket } from '../tickets/entities/ticket.entity.js';
import { ConsoleMailer } from './mailers/console-mailer.js';
import { InMemoryMailer } from './mailers/in-memory-mailer.js';
import { NotificacionesService } from './notificaciones.service.js';
import {
  maskEmail,
  renderTicketNotification,
  validateRecipient,
} from './templates/notification-template.js';

const ticket = {
  id: 'ticket-id',
  numero: 'INC0001',
  titulo: 'Título privado',
  descripcion: 'Descripción privada',
  solucion: 'Solución privada',
  solicitanteNombre: '<script>alert("x")</script>\r\nSolicitante',
  solicitanteCorreo: 'solicitante@example.com',
} as Ticket;

function createService(options: {
  enviar?: (message: unknown) => Promise<{ accepted: boolean }>;
  events?: Array<Record<string, unknown>>;
  maximum?: number;
  timeout?: number;
} = {}) {
  const registered: Array<Record<string, unknown>> = [];
  const repository = {
    listarPorTicket: vi.fn().mockResolvedValue(options.events ?? []),
  };
  const bitacora = {
    registrar: vi.fn(async (_id, tipo, detalle, usuarioId) => {
      registered.push({ tipo, detalle, usuarioId });
    }),
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'NOTIFICACIONES_MAX_POR_TICKET'
        ? options.maximum ?? fallback
        : key === 'MAIL_TIMEOUT_MS'
          ? options.timeout ?? fallback
          : key === 'PORTAL_PUBLICO_URL'
            ? 'https://portal.example.com'
            : fallback,
  };
  const mailer = {
    enviar: options.enviar ?? vi.fn().mockResolvedValue({ accepted: true }),
  };
  return {
    service: new NotificacionesService(
      mailer,
      repository as never,
      bitacora as never,
      config as never,
    ),
    mailer,
    registered,
  };
}

describe('notification templates and service', () => {
  it('renders safe text and HTML without private ticket fields', () => {
    const message = renderTicketNotification(ticket, 'CREACION', 'https://portal.example.com');
    expect(message.asunto).toBe('[Mesa de Servicio] Ticket INC0001 creado');
    expect(
      renderTicketNotification(ticket, 'ESCALAMIENTO', 'https://portal.example.com').asunto,
    ).toBe('[Mesa de Servicio] Ticket INC0001 escalado');
    expect(
      renderTicketNotification(ticket, 'CIERRE', 'https://portal.example.com').asunto,
    ).toBe('[Mesa de Servicio] Ticket INC0001 cerrado');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('&quot;x&quot;');
    expect(message.texto).not.toContain('\r');
    for (const prohibited of [
      ticket.titulo,
      ticket.descripcion,
      ticket.solucion,
      'SLA',
      'Área',
      'Agente',
    ]) {
      expect(`${message.asunto}\n${message.texto}\n${message.html}`).not.toContain(prohibited);
    }
  });

  it('validates ticket numbers and recipient addresses', () => {
    expect(() =>
      renderTicketNotification({ ...ticket, numero: 'INC0001 título' }, 'CIERRE', 'https://portal.example.com'),
    ).toThrow();
    expect(() => validateRecipient('user@example.com\r\nBcc:evil@example.com')).toThrow();
    expect(() => validateRecipient('user@example.com,other@example.com')).toThrow();
    expect(maskEmail('josh@example.com')).toBe('j***@example.com');
  });

  it('records the timeout as a failed attempt and never throws', async () => {
    vi.useFakeTimers();
    try {
      const { service, registered } = createService({
        timeout: 10,
        enviar: () => new Promise(() => undefined),
      });
      const result = service.notificar(ticket, 'CREACION', { id: 'actor-1' });
      await vi.advanceTimersByTimeAsync(10);
      await expect(result).resolves.toMatchObject({ estado: 'FALLIDA', aviso: expect.any(String) });
      expect(registered[0]).toMatchObject({
        tipo: EventoBitacoraTipo.NOTIFICACION_FALLIDA,
        detalle: { motivo: 'TIMEOUT', destinatario: 's***@example.com' },
        usuarioId: 'actor-1',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not throw when the mailer rejects and does not expose technical details', async () => {
    const { service, registered } = createService({
      enviar: async () => {
        throw new Error('SMTP secret technical failure');
      },
    });
    await expect(service.notificar(ticket, 'ESCALAMIENTO', { id: 'actor-1' })).resolves.toMatchObject({
      estado: 'FALLIDA',
      aviso: expect.not.stringContaining('SMTP'),
    });
    expect(registered[0]).toMatchObject({
      tipo: EventoBitacoraTipo.NOTIFICACION_FALLIDA,
      detalle: { motivo: 'ERROR_ENVIO' },
    });
    expect(JSON.stringify(registered)).not.toContain('SMTP secret');
  });

  it('records a rejected mailer response with a controlled reason', async () => {
    const { service, registered } = createService({
      enviar: async () => ({ accepted: false }),
    });
    await expect(service.notificar(ticket, 'CIERRE', { id: 'actor-1' })).resolves.toMatchObject({
      estado: 'FALLIDA',
    });
    expect(registered[0]).toMatchObject({
      tipo: EventoBitacoraTipo.NOTIFICACION_FALLIDA,
      detalle: { motivo: 'RECHAZADO' },
    });
  });

  it('does not send when the ticket has reached the successful-notification limit', async () => {
    const successfulEvent = {
      tipo: EventoBitacoraTipo.NOTIFICACION_ENVIADA,
      detalle: { notificacion: 'CREACION' },
    };
    const { service, mailer, registered } = createService({
      events: [successfulEvent],
      maximum: 1,
    });
    const result = await service.notificar(ticket, 'CIERRE', { id: 'actor-1' });
    expect(result.estado).toBe('FALLIDA');
    expect(mailer.enviar).not.toHaveBeenCalled();
    expect(registered[0]).toMatchObject({
      tipo: EventoBitacoraTipo.NOTIFICACION_FALLIDA,
      detalle: { motivo: 'LIMITE' },
    });
  });

  it('stores successful messages in the in-memory outbox', async () => {
    const mailer = new InMemoryMailer();
    await mailer.enviar({
      para: 'solicitante@example.com',
      asunto: '[Mesa de Servicio] Ticket INC0001 creado',
      texto: 'texto',
      html: '<p>texto</p>',
    });
    expect(mailer.bandeja()).toHaveLength(1);
    mailer.limpiar();
    expect(mailer.bandeja()).toHaveLength(0);
  });

  it('sends automatic-response headers to a simple recipient without user-controlled mail headers', async () => {
    const mailer = new InMemoryMailer();
    const { service } = createService({ enviar: mailer.enviar.bind(mailer) });
    for (const type of ['CREACION', 'ESCALAMIENTO', 'CIERRE'] as const) {
      await service.notificar(ticket, type, { id: 'actor-1' });
    }

    for (const message of mailer.bandeja()) {
      expect(message).toMatchObject({
        para: 'solicitante@example.com',
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
        },
      });
      expect(message.para).not.toContain('<');
      expect(Object.keys(message)).toEqual(['para', 'asunto', 'texto', 'html', 'headers']);
      expect(message).not.toHaveProperty('cc');
      expect(message).not.toHaveProperty('bcc');
      expect(message).not.toHaveProperty('replyTo');
    }
    expect(mailer.bandeja()).toHaveLength(3);
  });

  it('logs only ticket type and number in console transport', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      await new ConsoleMailer().enviar({
        para: 'sensitive-recipient@example.com',
        asunto: '[Mesa de Servicio] Ticket REQ1234 creado',
        texto: 'Sensitive message body',
        html: '<p>Sensitive message body</p>',
      });
      const logged = logSpy.mock.calls.flat().join(' ');
      expect(logged).toContain('REQ');
      expect(logged).toContain('REQ1234');
      expect(logged).not.toContain('sensitive-recipient');
      expect(logged).not.toContain('Sensitive message body');
    } finally {
      logSpy.mockRestore();
    }
  });
});
