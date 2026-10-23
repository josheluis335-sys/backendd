import { calcularSegundosHabiles } from './business-time.js';
import { createSlaConfig } from './sla.config.js';

describe('calcularSegundosHabiles', () => {
  const config = createSlaConfig({ SLA_TIMEZONE: 'UTC' });
  const seconds = (start: string, end: string, activeConfig = config) =>
    calcularSegundosHabiles(new Date(start), new Date(end), activeConfig);

  it('clips a start before working hours to 08:00', () => {
    expect(seconds('2026-10-19T07:00:00Z', '2026-10-19T10:00:00Z')).toBe(2 * 3600);
  });

  it('starts counting on the next workday when the start is after 17:00', () => {
    expect(seconds('2026-10-19T18:00:00Z', '2026-10-20T10:00:00Z')).toBe(2 * 3600);
  });

  it('counts an interval inside one workday', () => {
    expect(seconds('2026-10-19T10:00:00Z', '2026-10-19T12:00:00Z')).toBe(2 * 3600);
  });

  it('counts Friday 16:30 through Monday 08:30 as one hour', () => {
    expect(seconds('2026-10-23T16:30:00Z', '2026-10-26T08:30:00Z')).toBe(3600);
  });

  it('counts zero on a complete weekend', () => {
    expect(seconds('2026-10-24T08:00:00Z', '2026-10-25T18:00:00Z')).toBe(0);
  });

  it('sums work hours across several days', () => {
    expect(seconds('2026-10-19T08:00:00Z', '2026-10-21T10:00:00Z')).toBe(20 * 3600);
  });

  it('excludes a holiday between workdays', () => {
    const withHoliday = createSlaConfig({
      SLA_TIMEZONE: 'UTC',
      SLA_FESTIVOS: '2026-10-20',
    });
    expect(seconds('2026-10-19T08:00:00Z', '2026-10-21T10:00:00Z', withHoliday)).toBe(
      11 * 3600,
    );
  });

  it('returns zero when both endpoints are on a weekend', () => {
    expect(seconds('2026-10-24T09:00:00Z', '2026-10-25T16:00:00Z')).toBe(0);
  });

  it('returns zero when the end is not after the start', () => {
    expect(seconds('2026-10-19T12:00:00Z', '2026-10-19T12:00:00Z')).toBe(0);
    expect(seconds('2026-10-20T12:00:00Z', '2026-10-19T12:00:00Z')).toBe(0);
  });

  it('uses each timezone calendar across daylight-saving time', () => {
    const newYork = createSlaConfig({ SLA_TIMEZONE: 'America/New_York' });
    const interval = ['2026-03-08T12:00:00Z', '2026-03-09T13:00:00Z'] as const;
    expect(seconds(interval[0], interval[1])).toBe(5 * 3600);
    expect(seconds(interval[0], interval[1], newYork)).toBe(3600);
  });

  it('rejects intervals beyond the bounded day iteration limit', () => {
    expect(() => seconds('2000-01-01T00:00:00Z', '2030-01-01T00:00:00Z')).toThrow(
      'supera el máximo',
    );
  });
});
