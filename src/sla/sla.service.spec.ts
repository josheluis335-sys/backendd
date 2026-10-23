import { ClockService } from '../common/clock/clock.service.js';
import {
  TicketChannel,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../tickets/entities/ticket.entity.js';
import { createSlaConfig } from './sla.config.js';
import { SlaService, SlaState } from './sla.service.js';

describe('SlaService', () => {
  let now: Date;
  let service: SlaService;

  const ticket = (overrides: Record<string, unknown> = {}) => ({
    id: 'ticket-sla',
    version: 1,
    tipo: TicketType.INC,
    consecutivo: 1,
    numero: 'INC0001',
    titulo: 'Error de acceso',
    descripcion: 'El usuario no puede iniciar sesión.',
    categoriaId: 'category-1',
    prioridad: TicketPriority.ALTA,
    canal: TicketChannel.CHAT,
    solicitanteNombre: 'Solicitante',
    solicitanteCorreo: 'solicitante@example.com',
    estado: TicketStatus.NUEVO,
    areaActualId: 'area-1',
    creadoPorId: 'user-1',
    fechaCreacion: new Date('2026-10-19T08:00:00.000Z'),
    fechaUltimaActualizacion: new Date('2026-10-19T08:00:00.000Z'),
    tiempoPausaAcumuladoSeg: 0,
    tiempoPausaHabilAcumuladoSeg: 0,
    pausaInicio: null,
    estadoAntesDePausa: null,
    motivoPausa: null,
    solucion: null,
    fechaCierre: null,
    ...overrides,
  }) as never;

  beforeEach(() => {
    now = new Date('2026-10-19T09:00:00.000Z');
    service = new SlaService(createSlaConfig({ SLA_TIMEZONE: 'UTC' }), {
      ahora: () => new Date(now),
    } as ClockService);
  });

  it('reports DENTRO_DEL_PLAZO, PROXIMO_A_VENCER at 80%, and VENCIDO', () => {
    expect(service.calcular(ticket()).estado).toBe(SlaState.DENTRO_DEL_PLAZO);

    now = new Date('2026-10-19T14:24:00.000Z');
    expect(service.calcular(ticket()).estado).toBe(SlaState.PROXIMO_A_VENCER);

    now = new Date('2026-10-20T08:01:00.000Z');
    expect(service.calcular(ticket()).estado).toBe(SlaState.VENCIDO);
  });

  it('freezes SLA while paused and subtracts business time for a pause spanning a weekend', () => {
    now = new Date('2026-10-19T13:00:00.000Z');
    const paused = service.calcular(
      ticket({
        estado: TicketStatus.EN_PAUSA,
        pausaInicio: new Date('2026-10-19T12:00:00.000Z'),
        tiempoPausaHabilAcumuladoSeg: 2 * 3600,
      }),
    );
    expect(paused.consumidoHoras).toBe(2);
    expect(paused.detenido).toBe(true);

    now = new Date('2026-10-26T08:30:00.000Z');
    const weekendPause = service.calcular(
      ticket({
        fechaCreacion: new Date('2026-10-23T08:00:00.000Z'),
        estado: TicketStatus.EN_PAUSA,
        pausaInicio: new Date('2026-10-23T16:30:00.000Z'),
      }),
    );
    expect(weekendPause.consumidoHoras).toBe(8.5);
  });

  it('does not mark closed tickets as near when they close below the threshold', () => {
    now = new Date('2026-10-19T14:00:00.000Z');
    const closedWithin = service.calcular(
      ticket({
        estado: TicketStatus.CERRADO,
        fechaCierre: new Date('2026-10-19T14:00:00.000Z'),
      }),
    );
    expect(closedWithin.estado).toBe(SlaState.DENTRO_DEL_PLAZO);
    expect(closedWithin.detenido).toBe(true);

    const closedLate = service.calcular(
      ticket({
        estado: TicketStatus.CERRADO,
        fechaCierre: new Date('2026-10-20T08:01:00.000Z'),
      }),
    );
    expect(closedLate.estado).toBe(SlaState.VENCIDO);
  });

  it('starts a ticket created before working hours at the configured opening time', () => {
    now = new Date('2026-10-19T09:00:00.000Z');
    const createdEarly = service.calcular(
      ticket({ fechaCreacion: new Date('2026-10-19T07:00:00.000Z') }),
    );
    expect(createdEarly.consumidoHoras).toBe(1);
  });
});
