import { ConflictException } from '@nestjs/common';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { TicketPriority, TicketType } from '../tickets/entities/ticket.entity.js';
import { ComunicacionEstado } from './entities/comunicacion.entity.js';
import { InMemoryComunicacionesRepository } from './repositories/in-memory-comunicaciones.repository.js';
import { ComunicacionesService } from './comunicaciones.service.js';

const now = new Date('2026-10-23T12:00:00.000Z');
const actor = { id: 'agent-id', rol: UserRole.AGENTE, areaId: 'area-id' };
const mailboxMessage = (overrides: Record<string, unknown> = {}) => ({
  uid: '1',
  messageId: '<message-1@example.com>',
  remitenteNombre: ' Persona  Solicitante ',
  remitenteCorreo: 'Persona@Example.com',
  asunto: '  Error de acceso\r\n',
  cuerpo: '  No puedo ingresar a mi cuenta.\r\n  ',
  fechaRecepcion: now,
  headers: {},
  ...overrides,
});

function createService(options: {
  maxPerHour?: number;
  maxTotal?: number;
  allowedDomains?: string;
  createFromCommunication?: (
    dto: unknown,
    actor: unknown,
    commit: (ticket: { id: string }) => Promise<void>,
  ) => Promise<unknown>;
  clock?: { value: Date };
} = {}) {
  const unitOfWork = new TicketActionUnitOfWork();
  const repository = new InMemoryComunicacionesRepository(unitOfWork);
  const ticketsService = {
    createFromCommunication:
      options.createFromCommunication ??
      vi.fn(async (_dto, _actor, commit) => {
        const ticket = { id: 'ticket-created' };
        await commit(ticket);
        return ticket;
      }),
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'COMUNICACIONES_MAX_POR_REMITENTE_HORA'
        ? (options.maxPerHour ?? fallback)
        : key === 'COMUNICACIONES_MAX_TOTAL'
          ? (options.maxTotal ?? fallback)
          : key === 'CORREO_DOMINIOS_PERMITIDOS'
            ? options.allowedDomains ?? ''
            : key === 'MAIL_FROM'
              ? 'sender@example.com'
            : fallback,
  };
  const clock = { ahora: () => new Date(options.clock?.value ?? now) };
  return {
    service: new ComunicacionesService(
      repository,
      ticketsService as never,
      config as never,
      clock as never,
    ),
    repository,
    ticketsService,
    unitOfWork,
  };
}

describe('ComunicacionesService', () => {
  it('normalizes incoming data and deduplicates by normalized Message-ID', async () => {
    const { service, repository } = createService();
    const received = await service.recibir(mailboxMessage());
    const duplicate = await service.recibir(mailboxMessage({ uid: '2' }));

    expect(received).toMatchObject({
      messageId: 'message-1@example.com',
      remitenteNombre: 'Persona Solicitante',
      remitenteCorreo: 'persona@example.com',
      asunto: 'Error de acceso',
      cuerpo: 'No puedo ingresar a mi cuenta.',
      estado: ComunicacionEstado.PENDIENTE,
    });
    expect(duplicate?.id).toBe(received?.id);
    expect(await repository.listar()).toHaveLength(1);
  });

  it('stores automatic messages as discarded and never converts them', async () => {
    const { service } = createService();
    const received = await service.recibir(
      mailboxMessage({
        headers: { 'Auto-Submitted': 'auto-replied' },
      }),
    );
    expect(received).toMatchObject({
      estado: ComunicacionEstado.DESCARTADO,
      motivoDescarte: 'CORREO_AUTOMATICO',
    });
    const subjectAutoReply = await service.recibir(
      mailboxMessage({
        messageId: 'automatic-subject@example.com',
        asunto: 'Automatic reply: out of office',
        headers: {},
      }),
    );
    expect(subjectAutoReply).toMatchObject({
      estado: ComunicacionEstado.DESCARTADO,
      motivoDescarte: 'CORREO_AUTOMATICO',
    });
    const headerCases = [
      { 'X-Auto-Response-Suppress': 'All' },
      { Precedence: 'bulk' },
      { 'List-Id': 'newsletter.example' },
      { 'Content-Type': 'multipart/report; report-type=delivery-status' },
      { 'X-Failed-Recipients': 'private@example.com' },
    ];
    for (const [index, headers] of headerCases.entries()) {
      const discarded = await service.recibir(
        mailboxMessage({
          messageId: `automatic-${index}@example.com`,
          headers,
        }),
      );
      expect(discarded?.estado).toBe(ComunicacionEstado.DESCARTADO);
    }
    await expect(
      service.convertir(
        received!.id,
        {
          categoriaId: '123e4567-e89b-42d3-a456-426614174000',
          tipo: TicketType.INC,
          prioridad: TicketPriority.MEDIA,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('discards oversized IMAP messages without storing their content', async () => {
    const { service } = createService();
    const received = await service.recibir(
      mailboxMessage({
        tamanoExcedido: true,
        cuerpo: '',
      }),
    );
    expect(received).toMatchObject({
      estado: ComunicacionEstado.DESCARTADO,
      motivoDescarte: 'CORREO_DEMASIADO_GRANDE',
      cuerpo: '',
    });
  });

  it('enforces per-sender hourly limits and truncates long bodies with the marker', async () => {
    const clock = { value: new Date(now) };
    const limited = createService({ maxPerHour: 1, clock });
    await expect(limited.service.recibir(mailboxMessage())).resolves.toBeTruthy();
    await expect(
      limited.service.recibir(
        mailboxMessage({ uid: '2', messageId: 'message-2@example.com' }),
      ),
    ).resolves.toBeNull();
    clock.value = new Date(now.getTime() + 60 * 60 * 1000 + 1);
    await expect(
      limited.service.recibir(
        mailboxMessage({ uid: '3', messageId: 'message-3@example.com' }),
      ),
    ).resolves.toBeTruthy();

    const bounded = createService();
    await bounded.service.recibir(mailboxMessage());
    const longMessage = await bounded.service.recibir(
      mailboxMessage({
        messageId: 'long-message@example.com',
        cuerpo: 'a'.repeat(10_000),
      }),
    );
    expect(longMessage?.cuerpo).toHaveLength(5000);
    expect(longMessage?.cuerpo.endsWith('[mensaje recortado]')).toBe(true);

    const result = await bounded.service.convertir(
      longMessage!.id,
      {
        categoriaId: '123e4567-e89b-42d3-a456-426614174000',
        tipo: TicketType.INC,
        prioridad: TicketPriority.MEDIA,
      },
      actor,
    );
    expect(result.ticket).toBeTruthy();
    expect((bounded.ticketsService.createFromCommunication as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith(
        expect.objectContaining({ descripcion: expect.any(String) }),
        actor,
        expect.any(Function),
      );
    const sentDto = (bounded.ticketsService.createFromCommunication as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as { descripcion: string };
    expect(sentDto.descripcion).toHaveLength(5000);
  });

  it('deduplicates a previously stored message after a service restart', async () => {
    const first = createService();
    const saved = await first.service.recibir(mailboxMessage());
    const afterRestart = new ComunicacionesService(
      first.repository,
      first.ticketsService as never,
      { get: (_key: string, fallback?: unknown) => fallback } as never,
      { ahora: () => new Date(now) } as never,
    );
    const duplicate = await afterRestart.recibir(mailboxMessage({ uid: 'new-uid' }));
    expect(duplicate?.id).toBe(saved?.id);
    expect(await first.repository.listar()).toHaveLength(1);
  });

  it('uses a stable deterministic key when Message-ID is absent', async () => {
    const { service, repository } = createService();
    const withoutId = mailboxMessage({ messageId: undefined });
    const first = await service.recibir(withoutId);
    const second = await service.recibir({ ...withoutId, uid: 'second-uid' });
    expect(first?.messageId).toMatch(/^[a-f0-9]{64}$/);
    expect(second?.id).toBe(first?.id);
    expect(await repository.listar()).toHaveLength(1);
  });

  it('enforces allowed sender domains and per-ticket pending total', async () => {
    const domainLimited = createService({ allowedDomains: 'company.example' });
    const rejected = await domainLimited.service.recibir(mailboxMessage());
    expect(rejected).toMatchObject({
      estado: ComunicacionEstado.DESCARTADO,
      motivoDescarte: 'DOMINIO_NO_PERMITIDO',
    });

    const totalLimited = createService({ maxTotal: 1 });
    await totalLimited.service.recibir(mailboxMessage());
    await expect(
      totalLimited.service.recibir(
        mailboxMessage({ messageId: 'second@example.com' }),
      ),
    ).resolves.toBeNull();
  });

  it('discards invalid or multiple From values and own sender addresses', async () => {
    const { service } = createService();
    for (const incoming of [
      mailboxMessage({ messageId: 'multi@example.com', fromMultipleOrInvalid: true }),
      mailboxMessage({ messageId: 'invalid@example.com', remitenteCorreo: 'not-an-email' }),
      mailboxMessage({ messageId: 'self@example.com', remitenteCorreo: 'sender@example.com' }),
    ]) {
      const result = await service.recibir(incoming);
      expect(result?.estado).toBe(ComunicacionEstado.DESCARTADO);
    }
  });

  it('converts a pending email through ticket creation and atomically marks it converted', async () => {
    const { service, repository, ticketsService } = createService();
    const incoming = await service.recibir(mailboxMessage());
    const result = await service.convertir(
      incoming!.id,
      {
        categoriaId: '123e4567-e89b-42d3-a456-426614174000',
        tipo: TicketType.REQ,
        prioridad: TicketPriority.ALTA,
      },
      actor,
    );

    expect(ticketsService.createFromCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: TicketType.REQ,
        prioridad: TicketPriority.ALTA,
        canal: 'CORREO',
        titulo: 'Error de acceso',
      }),
      actor,
      expect.any(Function),
    );
    expect(result.comunicacion).toMatchObject({
      estado: ComunicacionEstado.CONVERTIDO,
      ticketId: 'ticket-created',
    });
    expect(await repository.buscarPorId(incoming!.id)).toMatchObject({
      estado: ComunicacionEstado.CONVERTIDO,
    });
  });

  it('rejects conversion for non-agent actors', async () => {
    const { service } = createService();
    await expect(
      service.convertir('unknown', {} as never, {
        id: 'admin-id',
        rol: UserRole.ADMINISTRADOR,
      }),
    ).rejects.toThrow('Solo un agente puede convertir correos en tickets.');
  });
});
