import { TicketPriority, TicketType } from '../tickets/entities/ticket.entity.js';

export interface SlaConfig {
  timezone: string;
  horaInicio: number;
  horaFin: number;
  umbralProximo: number;
  festivos: ReadonlySet<string>;
  limitesHoras: Readonly<Record<TicketType, Readonly<Record<TicketPriority, number>>>>;
}

export const SLA_LIMITS_HOURS = {
  [TicketType.INC]: {
    [TicketPriority.CRITICA]: 4,
    [TicketPriority.ALTA]: 8,
    [TicketPriority.MEDIA]: 24,
    [TicketPriority.BAJA]: 40,
  },
  [TicketType.REQ]: {
    [TicketPriority.CRITICA]: 8,
    [TicketPriority.ALTA]: 16,
    [TicketPriority.MEDIA]: 40,
    [TicketPriority.BAJA]: 80,
  },
} as const satisfies SlaConfig['limitesHoras'];

export function createSlaConfig(environment: Record<string, unknown>): SlaConfig {
  const timezone = environment.SLA_TIMEZONE;
  const horaInicio = Number(environment.SLA_HORA_INICIO ?? 8);
  const horaFin = Number(environment.SLA_HORA_FIN ?? 17);
  const umbralProximo = Number(environment.SLA_UMBRAL_PROXIMO ?? 0.8);
  const rawFestivos = environment.SLA_FESTIVOS ?? '';
  if (typeof rawFestivos !== 'string') {
    throw new Error('SLA_FESTIVOS debe ser texto con fechas AAAA-MM-DD separadas por coma.');
  }
  const festivos = rawFestivos
    .split(',')
    .map((date) => date.trim())
    .filter(Boolean);

  if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
    throw new Error('SLA_TIMEZONE debe ser una zona IANA válida.');
  }
  if (
    !Number.isInteger(horaInicio) ||
    !Number.isInteger(horaFin) ||
    horaInicio < 0 ||
    horaFin > 23 ||
    horaInicio >= horaFin
  ) {
    throw new Error('SLA_HORA_INICIO y SLA_HORA_FIN deben ser enteros entre 0 y 23, con inicio < fin.');
  }
  if (!Number.isFinite(umbralProximo) || umbralProximo <= 0 || umbralProximo >= 1) {
    throw new Error('SLA_UMBRAL_PROXIMO debe ser mayor que 0 y menor que 1.');
  }
  if (!hasCompleteSlaTable(SLA_LIMITS_HOURS)) {
    throw new Error('La tabla de límites SLA debe definir las ocho combinaciones tipo y prioridad.');
  }
  if (festivos.some((date) => !isIsoDate(date))) {
    throw new Error('SLA_FESTIVOS debe contener fechas válidas AAAA-MM-DD separadas por coma.');
  }

  return {
    timezone,
    horaInicio,
    horaFin,
    umbralProximo,
    festivos: new Set(festivos),
    limitesHoras: SLA_LIMITS_HOURS,
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function hasCompleteSlaTable(
  table: Readonly<Record<string, Readonly<Record<string, number>>>>,
): boolean {
  return Object.values(TicketType).every((type) =>
    Object.values(TicketPriority).every(
      (priority) => Number.isFinite(table[type]?.[priority]) && table[type][priority] > 0,
    ),
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
