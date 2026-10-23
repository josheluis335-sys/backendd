import { createSlaConfig, hasCompleteSlaTable } from './sla.config.js';

describe('SLA configuration', () => {
  it('rejects an unknown IANA timezone', () => {
    expect(() => createSlaConfig({ SLA_TIMEZONE: 'Mars/Olympus_Mons' })).toThrow(
      'SLA_TIMEZONE debe ser una zona IANA válida.',
    );
  });

  it('rejects an invalid threshold and working hours', () => {
    expect(() => createSlaConfig({ SLA_TIMEZONE: 'UTC', SLA_UMBRAL_PROXIMO: 1 })).toThrow(
      'SLA_UMBRAL_PROXIMO',
    );
    expect(() =>
      createSlaConfig({ SLA_TIMEZONE: 'UTC', SLA_HORA_INICIO: 17, SLA_HORA_FIN: 8 }),
    ).toThrow('SLA_HORA_INICIO');
  });

  it('requires all eight type and priority limits', () => {
    expect(
      hasCompleteSlaTable({
        INC: { CRITICA: 4 },
        REQ: { CRITICA: 8 },
      }),
    ).toBe(false);
    expect(createSlaConfig({ SLA_TIMEZONE: 'UTC' }).limitesHoras.REQ.BAJA).toBe(80);
  });

  it('rejects missing timezone and malformed holidays at environment validation', async () => {
    const { validateEnvironment } = await import('../config/env.validation.js');
    const base = {
      JWT_SECRET: 'test-secret-that-is-long-enough-for-hmac-validation',
      ADMIN_NAME: 'Administrador de pruebas',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'TestPassword123',
    };
    expect(() => validateEnvironment(base)).toThrow('SLA_TIMEZONE es obligatorio.');
    expect(() =>
      validateEnvironment({ ...base, SLA_TIMEZONE: 'UTC', SLA_FESTIVOS: '2026-02-30' }),
    ).toThrow('SLA_FESTIVOS contiene una fecha no válida');
    expect(() =>
      validateEnvironment({ ...base, SLA_TIMEZONE: 'Mars/Olympus_Mons' }),
    ).toThrow('SLA_TIMEZONE debe ser una zona IANA válida.');
    expect(() =>
      validateEnvironment({ ...base, SLA_TIMEZONE: 'UTC', SLA_UMBRAL_PROXIMO: 0 }),
    ).toThrow();
    expect(() =>
      validateEnvironment({
        ...base,
        SLA_TIMEZONE: 'UTC',
        SLA_HORA_INICIO: 17,
        SLA_HORA_FIN: 8,
      }),
    ).toThrow('SLA_HORA_INICIO debe ser menor');
  });
});
