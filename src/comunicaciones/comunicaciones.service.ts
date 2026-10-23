import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { ClockService } from '../common/clock/clock.service.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import type { CreateTicketDto } from '../tickets/dto/create-ticket.dto.js';
import { TicketChannel } from '../tickets/entities/ticket.entity.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { COMUNICACIONES_REPOSITORY } from './comunicaciones.constants.js';
import { ComunicacionEstado } from './entities/comunicacion.entity.js';
import type { Comunicacion } from './entities/comunicacion.entity.js';
import type { ComunicacionesRepository } from './interfaces/comunicaciones-repository.interface.js';
import type { MailboxMessage } from './interfaces/mailbox-reader.interface.js';
import type { ConvertirComunicacionDto } from './dto/convertir-comunicacion.dto.js';
import type { ListComunicacionesDto } from './dto/list-comunicaciones.dto.js';

export interface PaginatedComunicacionesResponse {
  data: Comunicacion[];
  page: number;
  pageSize: number;
  total: number;
}

const ADDRESS_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const MAX_BODY_CHARACTERS = 5000;

@Injectable()
export class ComunicacionesService {
  constructor(
    @Inject(COMUNICACIONES_REPOSITORY)
    private readonly repository: ComunicacionesRepository,
    private readonly ticketsService: TicketsService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  async recibir(message: MailboxMessage): Promise<Comunicacion | null> {
    const messageId = this.canonicalMessageId(message);
    const existing = await this.repository.buscarPorMessageId(messageId);
    if (existing) return existing;

    const now = this.clock.ahora();
    const messages = await this.repository.listar();
    const cutoff = now.getTime() - 60 * 60 * 1000;
    const sender = this.normalizeAddress(message.remitenteCorreo ?? '');
    const senderPastHour = messages.filter(
      (item) =>
        item.remitenteCorreo === sender &&
        item.ingresadoEn.getTime() > cutoff &&
        item.ingresadoEn.getTime() <= now.getTime(),
    ).length;
    const maximumPerSender = this.config.get<number>(
      'COMUNICACIONES_MAX_POR_REMITENTE_HORA',
      20,
    );

    if (sender !== 'desconocido@invalid' && senderPastHour >= maximumPerSender) {
      return null;
    }

    const reason = message.tamanoExcedido
      ? 'CORREO_DEMASIADO_GRANDE'
      : this.discardReason(message, sender);
    const normalizedBody = normalizeText(message.cuerpo ?? '');
    const marker = '[mensaje recortado]';
    const boundedBody =
      normalizedBody.length > MAX_BODY_CHARACTERS
        ? `${normalizedBody
            .slice(0, Math.max(0, MAX_BODY_CHARACTERS - marker.length))
            .trimEnd()}${marker}`
        : normalizedBody;
    const communication: Comunicacion = {
      id: randomUUID(),
      messageId,
      remitenteNombre: normalizeName(message.remitenteNombre ?? '', sender),
      remitenteCorreo: sender,
      asunto: normalizeSubject(message.asunto ?? ''),
      cuerpo: boundedBody,
      fechaRecepcion:
        message.fechaRecepcion instanceof Date && !Number.isNaN(message.fechaRecepcion.getTime())
          ? message.fechaRecepcion
          : now,
      ingresadoEn: now,
      estado: reason ? ComunicacionEstado.DESCARTADO : ComunicacionEstado.PENDIENTE,
      motivoDescarte: reason,
      ticketId: null,
    };

    const result = await this.repository.insertarSiNuevo(
      communication,
      this.config.get<number>('COMUNICACIONES_MAX_TOTAL', 2000),
    );
    if (result === 'INSERTED') return communication;
    if (result === 'DUPLICATE') {
      return this.repository.buscarPorMessageId(messageId);
    }
    return null;
  }

  async listar(filters: ListComunicacionesDto): Promise<PaginatedComunicacionesResponse> {
    const messages = (await this.repository.listar())
      .filter((item) => filters.estado === undefined || item.estado === filters.estado)
      .sort((left, right) => right.fechaRecepcion.getTime() - left.fechaRecepcion.getTime());
    const start = (filters.page - 1) * filters.pageSize;
    return {
      data: messages.slice(start, start + filters.pageSize),
      page: filters.page,
      pageSize: filters.pageSize,
      total: messages.length,
    };
  }

  async detalle(id: string): Promise<Comunicacion> {
    const communication = await this.repository.buscarPorId(id);
    if (!communication) throw new NotFoundException('No se encontró el correo solicitado.');
    return communication;
  }

  async convertir(
    id: string,
    dto: ConvertirComunicacionDto,
    actor: TicketActor,
  ) {
    if (actor.rol !== UserRole.AGENTE) {
      throw new ConflictException('Solo un agente puede convertir correos en tickets.');
    }
    const communication = await this.detalle(id);
    if (communication.estado !== ComunicacionEstado.PENDIENTE) {
      throw new ConflictException('El correo ya fue procesado o no está disponible.');
    }

    const title = ticketTitle(communication.asunto);
    const description = ticketDescription(communication.cuerpo);
    const createDto: CreateTicketDto = {
      tipo: dto.tipo,
      prioridad: dto.prioridad,
      categoriaId: dto.categoriaId,
      canal: TicketChannel.CORREO,
      titulo: title,
      descripcion: description,
      solicitanteNombre: communication.remitenteNombre,
      solicitanteCorreo: communication.remitenteCorreo,
    };
    const ticket = await this.ticketsService.createFromCommunication(
      createDto,
      actor,
      (created) => this.repository.marcarConvertido(id, created.id),
    );
    const { notificacion, ...ticketResponse } = ticket;
    return {
      comunicacion: await this.detalle(id),
      ticket: ticketResponse,
      notificacion,
    };
  }

  private canonicalMessageId(message: MailboxMessage): string {
    const supplied = message.messageId?.trim().replace(/^<|>$/g, '').toLowerCase();
    if (supplied && supplied.length <= 998 && !/[\r\n]/.test(supplied)) {
      return supplied;
    }
    const receivedAt =
      message.fechaRecepcion instanceof Date &&
      !Number.isNaN(message.fechaRecepcion.getTime())
        ? message.fechaRecepcion.toISOString()
        : '';
    return createHash('sha256')
      .update(
        [
          message.remitenteCorreo ?? '',
          receivedAt,
          message.asunto ?? '',
          message.cuerpo ?? '',
        ].join('\n'),
      )
      .digest('hex');
  }

  private normalizeAddress(value: string): string {
    const trimmed = value.trim().toLowerCase();
    return ADDRESS_PATTERN.test(trimmed) && !/[\r\n]/.test(trimmed)
      ? trimmed
      : 'desconocido@invalid';
  }

  private discardReason(
    message: MailboxMessage,
    sender: string,
  ): string | null {
    if (message.fromMultipleOrInvalid) return 'REMITENTE_INVALIDO';
    if (isAutomatic(message)) return 'CORREO_AUTOMATICO';
    if (sender === 'desconocido@invalid') return 'REMITENTE_INVALIDO';
    if (this.isOwnOrBounceSender(sender)) return 'REMITENTE_AUTOMATICO';
    if (this.isDomainBlocked(sender)) return 'DOMINIO_NO_PERMITIDO';
    const headers = Object.fromEntries(
      Object.entries(message.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        value?.trim().toLowerCase(),
      ]),
    );
    if (
      headers['content-type']?.includes('multipart/report') ||
      !!headers['x-failed-recipients'] ||
      /^(mailer-daemon|postmaster|no[-_.]?reply)(?:@|$)/i.test(sender)
    ) {
      return 'REBOTE_O_REMITENTE_AUTOMATICO';
    }
    if (normalizeText(message.cuerpo ?? '').length === 0) return 'SIN_CONTENIDO';
    return null;
  }

  private isOwnOrBounceSender(sender: string): boolean {
    const ownAddresses = [
      this.config.get<string>('MAIL_FROM', ''),
      this.config.get<string>('IMAP_USER', ''),
    ]
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean);
    return ownAddresses.includes(sender);
  }

  private isDomainBlocked(sender: string): boolean {
    const configured = this.config.get<string>('CORREO_DOMINIOS_PERMITIDOS', '');
    const allowed = configured
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length === 0) return false;
    const domain = sender.split('@')[1] ?? '';
    return !allowed.includes(domain);
  }
}

function normalizeText(value: string): string {
  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n');
  let cleaned = '';
  for (const character of normalized) {
    const code = character.codePointAt(0) ?? 0;
    if (
      (code < 32 && character !== '\n' && character !== '\t') ||
      code === 127
    ) {
      continue;
    }
    cleaned += character;
  }
  return cleaned.trim();
}

function normalizeSubject(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ').slice(0, 150) || '(sin asunto)';
}

function normalizeName(value: string, email: string): string {
  const name = normalizeText(value).replace(/\s+/g, ' ').slice(0, 100);
  if (name.length >= 2) return name;
  const localPart = email.split('@')[0] ?? '';
  return localPart.length >= 2 ? localPart.slice(0, 100) : 'Solicitante';
}

function isAutomatic(message: MailboxMessage): boolean {
  const normalized = Object.fromEntries(
    Object.entries(message.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value?.trim().toLowerCase(),
    ]),
  );
  const autoSubmitted = normalized['auto-submitted'];
  return (
    (!!autoSubmitted && autoSubmitted !== 'no') ||
    !!normalized['x-auto-response-suppress'] ||
    /^(automatic reply|auto(?:matic)? reply|auto[- ]?reply|out of office|respuesta autom[áa]tica|fuera de oficina)\b/i.test(
    message.asunto ?? '',
    ) ||
    !!normalized['x-autoreply'] ||
    !!normalized['x-autorespond'] ||
    ['bulk', 'list', 'junk'].includes(normalized.precedence ?? '') ||
    !!normalized['list-id']
  );
}

function ticketTitle(subject: string): string {
  const normalized = normalizeSubject(subject);
  const title = normalized.length < 5 ? `Correo: ${normalized}` : normalized;
  return title.slice(0, 150);
}

function ticketDescription(body: string): string {
  const normalized = normalizeText(body);
  return (normalized.length >= 10 ? normalized : `Mensaje recibido: ${normalized || '(vacío)'}`)
    .slice(0, 5000);
}
