import type { SlaConfig } from './sla.config.js';

const MAX_ITERATIONS = 3660;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function calcularSegundosHabiles(
  inicio: Date,
  fin: Date,
  config: Pick<SlaConfig, 'timezone' | 'horaInicio' | 'horaFin' | 'festivos'>,
): number {
  const start = inicio.getTime();
  const end = fin.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const firstLocal = localDate(start, config.timezone);
  const lastLocal = localDate(end, config.timezone);
  const firstDay = daysFromCivil(firstLocal.year, firstLocal.month, firstLocal.day);
  const lastDay = daysFromCivil(lastLocal.year, lastLocal.month, lastLocal.day);
  const dayCount = lastDay - firstDay + 1;
  if (dayCount > MAX_ITERATIONS) {
    throw new RangeError(`El intervalo SLA supera el máximo de ${MAX_ITERATIONS} días.`);
  }

  let totalMilliseconds = 0;
  for (let offset = 0; offset < dayCount; offset += 1) {
    const dayNumber = firstDay + offset;
    const currentDay = civilFromDays(dayNumber);
    const isoDate = `${String(currentDay.year).padStart(4, '0')}-${String(currentDay.month).padStart(2, '0')}-${String(currentDay.day).padStart(2, '0')}`;
    const weekday = ((dayNumber + 4) % 7 + 7) % 7;
    if (weekday === 0 || weekday === 6 || config.festivos.has(isoDate)) continue;

    const day = {
      year: currentDay.year,
      month: currentDay.month,
      day: currentDay.day,
    };
    const workStart = localTimeToInstant({ ...day, hour: config.horaInicio, minute: 0, second: 0 }, config.timezone);
    const workEnd = localTimeToInstant({ ...day, hour: config.horaFin, minute: 0, second: 0 }, config.timezone);
    totalMilliseconds += Math.max(0, Math.min(end, workEnd) - Math.max(start, workStart));
  }
  return Math.floor(totalMilliseconds / 1000);
}

function localDate(timestamp: number, timezone: string): Pick<LocalDateTime, 'year' | 'month' | 'day'> {
  const parts = getFormatter(timezone).formatToParts(timestamp);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function localTimeToInstant(local: LocalDateTime, timezone: string): number {
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = getLocalDateTime(candidate, timezone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    const next = localAsUtc - (representedAsUtc - candidate);
    if (next === candidate) break;
    candidate = next;
  }
  return candidate;
}

function getLocalDateTime(timestamp: number, timezone: string): LocalDateTime {
  const parts = getFormatter(timezone).formatToParts(timestamp);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
    hour: Number(parts.find((part) => part.type === 'hour')?.value),
    minute: Number(parts.find((part) => part.type === 'minute')?.value),
    second: Number(parts.find((part) => part.type === 'second')?.value),
  };
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}
