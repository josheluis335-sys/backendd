import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventoBitacoraTipo } from '../bitacora/entities/evento-bitacora.entity.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { BITACORA_REPOSITORY } from '../bitacora/bitacora.constants.js';
import type { BitacoraRepository } from '../bitacora/interfaces/bitacora.repository.interface.js';
import type { Ticket } from '../tickets/entities/ticket.entity.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { MAILER } from './notificaciones.constants.js';
import type { MailerService } from './interfaces/mailer.interface.js';
import {
  maskEmail,
  renderTicketNotification,
  validateRecipient,
  type TicketNotificationType,
} from './templates/notification-template.js';

export type NotificationStatus = 'ENVIADA' | 'FALLIDA';
export type NotificationFailureReason =
  | 'TIMEOUT'
  | 'RECHAZADO'
  | 'ERROR_ENVIO'
  | 'LIMITE';

export interface NotificationResult {
  estado: NotificationStatus;
  aviso?: string;
}

const FAILURE_NOTICE =
  'No se pudo enviar el aviso al solicitante; infórmale su número de caso por otro medio.';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(BITACORA_REPOSITORY) private readonly bitacoraRepository: BitacoraRepository,
    private readonly bitacoraService: BitacoraService,
    private readonly config: ConfigService,
  ) {}

  async notificar(
    ticket: Ticket,
    tipo: TicketNotificationType,
    actor: Pick<TicketActor, 'id'>,
  ): Promise<NotificationResult> {
    let recipient = '***@***';
    let reason: NotificationFailureReason | null = null;
    let status: NotificationStatus = 'FALLIDA';

    try {
      recipient = maskEmail(validateRecipient(ticket.solicitanteCorreo));
      const maximum = this.config.get<number>('NOTIFICACIONES_MAX_POR_TICKET', 20);
      const successful = (await this.bitacoraRepository.listarPorTicket(ticket.id)).filter(
        (event) =>
          event.tipo === EventoBitacoraTipo.NOTIFICACION_ENVIADA &&
          event.detalle.notificacion !== undefined,
      ).length;
      if (successful >= maximum) {
        reason = 'LIMITE';
      } else {
        const rendered = renderTicketNotification(
          ticket,
          tipo,
          this.config.get<string>('PORTAL_PUBLICO_URL', 'http://localhost:3000'),
        );
        const result = await this.withTimeout(
          this.mailer.enviar({
            para: validateRecipient(ticket.solicitanteCorreo),
            ...rendered,
            headers: {
              'Auto-Submitted': 'auto-generated',
              'X-Auto-Response-Suppress': 'All',
            },
          }),
        );
        if (!result.accepted) reason = 'RECHAZADO';
        else status = 'ENVIADA';
      }
    } catch (error) {
      reason =
        error instanceof NotificationTimeoutError
          ? 'TIMEOUT'
          : error instanceof BadRequestException
            ? 'RECHAZADO'
            : 'ERROR_ENVIO';
    }

    const eventType =
      status === 'ENVIADA'
        ? EventoBitacoraTipo.NOTIFICACION_ENVIADA
        : EventoBitacoraTipo.NOTIFICACION_FALLIDA;
    try {
      await this.bitacoraService.registrar(
        ticket.id,
        eventType,
        {
          notificacion: tipo,
          destinatario: recipient,
          motivo: reason,
        },
        actor.id,
      );
    } catch {
      this.logger.error(`No se pudo registrar el resultado de notificación. Usuario: ${actor.id}.`);
    }

    if (status === 'ENVIADA') {
      this.logger.log(`Notificación enviada. Usuario: ${actor.id}; ticket: ${ticket.numero}.`);
      return { estado: status };
    }
    this.logger.warn(
      `Notificación fallida. Usuario: ${actor.id}; ticket: ${ticket.numero}; motivo: ${reason ?? 'ERROR_ENVIO'}.`,
    );
    return { estado: 'FALLIDA', aviso: FAILURE_NOTICE };
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    const timeoutMs = this.config.get<number>('MAIL_TIMEOUT_MS', 5000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new NotificationTimeoutError()), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

class NotificationTimeoutError extends Error {}
