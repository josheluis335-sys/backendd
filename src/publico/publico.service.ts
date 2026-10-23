import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PUBLIC_ATTEMPTS_STORE, PUBLIC_EMAIL_COMPARATOR, PUBLIC_LOOKUP_NOT_FOUND, PUBLIC_TICKET_LOOKUP } from './publico.constants.js';
import type { PublicAttemptsStore } from './interfaces/public-attempts-store.interface.js';
import type {
  PublicEmailComparator,
  PublicTicketLookup,
} from './interfaces/public-ticket-lookup.interface.js';
import { PublicTicketResponseDto } from './dto/public-ticket-response.dto.js';

const CASE_PATTERN = /^(INC|REQ)\d{4,}$/;
const DUMMY_EMAIL = 'portal-no-match@invalid.example';

@Injectable()
export class PublicoService {
  private readonly logger = new Logger(PublicoService.name);

  constructor(
    @Inject(PUBLIC_TICKET_LOOKUP)
    private readonly ticketLookup: PublicTicketLookup,
    @Inject(PUBLIC_ATTEMPTS_STORE)
    private readonly attempts: PublicAttemptsStore,
    private readonly config: ConfigService,
    @Inject(PUBLIC_EMAIL_COMPARATOR)
    private readonly compareEmail: PublicEmailComparator,
  ) {}

  async consultar(ip: string, body: unknown): Promise<PublicTicketResponseDto> {
    const input = normalizeLookupInput(body);
    const lock = this.attempts.blocked(ip, input.numeroCaso);
    if (lock.blocked) {
      this.logBlocked(ip, input.numeroCaso);
      throw new PublicLookupBlockedException(lock.retryAfterSeconds);
    }

    const ticket = await this.ticketLookup.buscarPorNumero(input.numeroCaso);
    const expectedEmail = ticket?.solicitanteCorreo ?? DUMMY_EMAIL;
    const emailMatches = this.compareEmail(expectedEmail, input.correo);
    const valid =
      input.numeroValido &&
      input.correoValido &&
      ticket !== null &&
      emailMatches;

    if (!valid || !ticket) {
      const failure = this.attempts.failure(ip, input.numeroCaso);
      if (failure.blocked) {
        this.logBlocked(ip, input.numeroCaso);
        throw new PublicLookupBlockedException(failure.retryAfterSeconds);
      }
      throw new NotFoundException(PUBLIC_LOOKUP_NOT_FOUND);
    }

    this.attempts.success(ip, input.numeroCaso);
    return PublicTicketResponseDto.fromTicket(ticket);
  }

  private logBlocked(ip: string, caseNumber: string): void {
    const ipHash = fingerprint(ip);
    const caseHash = fingerprint(caseNumber);
    this.logger.warn(`Portal bloqueado; ip=${ipHash}; caso=${caseHash}.`);
  }
}

export class PublicLookupBlockedException extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Consulta pública temporalmente bloqueada.');
  }
}

export function normalizeLookupInput(body: unknown): {
  numeroCaso: string;
  correo: string;
  numeroValido: boolean;
  correoValido: boolean;
} {
  const record =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const numeroCaso =
    typeof record.numeroCaso === 'string'
      ? record.numeroCaso.toUpperCase().replace(/\s/g, '')
      : '';
  const correo =
    typeof record.correo === 'string'
      ? record.correo.toLowerCase().replace(/\s/g, '')
      : '';
  return {
    numeroCaso,
    correo,
    numeroValido: CASE_PATTERN.test(numeroCaso),
    correoValido:
      correo.length <= 254 &&
      /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(correo),
  };
}

export function compareEmailConstantTime(expected: string, received: string): boolean {
  const expectedHash = createHash('sha256').update(expected).digest();
  const receivedHash = createHash('sha256').update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
