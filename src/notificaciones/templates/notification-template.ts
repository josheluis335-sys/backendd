import { BadRequestException } from '@nestjs/common';
import type { Ticket } from '../../tickets/entities/ticket.entity.js';

export type TicketNotificationType = 'CREACION' | 'ESCALAMIENTO' | 'CIERRE';

const SUBJECT_LABEL: Record<TicketNotificationType, string> = {
  CREACION: 'creado',
  ESCALAMIENTO: 'escalado',
  CIERRE: 'cerrado',
};

export interface RenderedNotification {
  asunto: string;
  texto: string;
  html: string;
}

export function renderTicketNotification(
  ticket: Ticket,
  type: TicketNotificationType,
  portalUrl: string,
): RenderedNotification {
  if (!/^(INC|REQ)\d{4,}$/.test(ticket.numero)) {
    throw new BadRequestException('El número del ticket no es válido para notificación.');
  }
  const nombre = stripControls(ticket.solicitanteNombre).trim();
  const number = ticket.numero;
  const portal = new URL(portalUrl).toString().replace(/\/$/, '');
  const asunto = `[Mesa de Servicio] Ticket ${number} ${SUBJECT_LABEL[type]}`;
  const sentence = `Tu caso ${number} fue ${SUBJECT_LABEL[type]}.`;
  const consultar = `Para consultarlo, visita ${portal}. Necesitarás el número de caso ${number} y este correo.`;
  const texto = `Hola ${nombre},\n\n${sentence}\n${consultar}`;
  const html = `<p>Hola ${escapeHtml(nombre)},</p><p>${escapeHtml(sentence)}</p><p>Para consultarlo, visita <a href="${escapeHtml(portal)}">${escapeHtml(portal)}</a>. Necesitarás el número de caso ${escapeHtml(number)} y este correo.</p>`;
  return { asunto, texto, html };
}

export function validateRecipient(recipient: string): string {
  if (containsControlCharacters(recipient)) {
    throw new BadRequestException('El correo del solicitante no es válido para notificación.');
  }
  const normalized = recipient.trim();
  if (
    normalized.includes(',') ||
    normalized.includes(';') ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)
  ) {
    throw new BadRequestException('El correo del solicitante no es válido para notificación.');
  }
  return normalized;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0);
    return code !== undefined && (code < 32 || code === 127);
  });
}

function stripControls(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && !(code < 32 || code === 127);
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
