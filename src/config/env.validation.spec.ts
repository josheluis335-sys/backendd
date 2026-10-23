import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './env.validation.js';

const validEnvironment = {
  JWT_SECRET: 'test-secret-that-is-long-enough-for-hmac-validation',
  ADMIN_NAME: 'Administrador de pruebas',
  ADMIN_EMAIL: 'admin-test@example.com',
  ADMIN_PASSWORD: 'test-admin-password-123',
  SLA_TIMEZONE: 'America/Mexico_City',
};

describe('validateEnvironment', () => {
  it('rejects a missing JWT_SECRET', () => {
    const { JWT_SECRET, ...environment } = validEnvironment;
    expect(JWT_SECRET).toBeTruthy();
    expect(() => validateEnvironment(environment)).toThrow('JWT_SECRET es obligatorio.');
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'too-short' }),
    ).toThrow('JWT_SECRET debe tener al menos 32 caracteres.');
  });

  it('rejects the value documented in .env.example', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_SECRET: 'replace-with-a-random-secret-of-at-least-32-characters',
      }),
    ).toThrow('JWT_SECRET no puede conservar el valor de ejemplo.');
  });

  it('prevents ConfigModule startup when JWT_SECRET is absent', async () => {
    const previousSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      await expect(
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
      ).rejects.toThrow('JWT_SECRET es obligatorio.');
    } finally {
      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
    }
  });

  it('prevents ConfigModule startup when JWT_SECRET is weak', async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'too-short';

    try {
      await expect(
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
      ).rejects.toThrow('JWT_SECRET debe tener al menos 32 caracteres.');
    } finally {
      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
    }
  });

  it('requires development-only sample account credentials in development', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'development',
      }),
    ).toThrow('Faltan variables del seed de desarrollo');
  });

  it('validates positive integer limits and applies documented defaults', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      ANEXOS_MAX_POR_PETICION: 5,
      ANEXOS_MAX_POR_TICKET: 50,
      ANEXOS_MAX_BYTES_POR_TICKET: 52_428_800,
      ANOTACIONES_MAX_POR_TICKET: 200,
      NOTIFICACIONES_MAX_POR_TICKET: 20,
      MAIL_TIMEOUT_MS: 5000,
      IMAP_HOST: 'localhost',
      IMAP_PORT: 1143,
      IMAP_USER: 'dev',
      IMAP_PASS: 'dev',
      IMAP_MAILBOX: 'INBOX',
      COMUNICACIONES_MAX_POR_REMITENTE_HORA: 20,
      COMUNICACIONES_MAX_TOTAL: 2000,
      IMAP_MAX_BYTES_MENSAJE: 5_242_880,
      PORTAL_MAX_INTENTOS: 5,
      PORTAL_BLOQUEO_MINUTOS: 5,
      PORTAL_MAX_INTENTOS_POR_CASO: 30,
      PORTAL_MAX_CLAVES: 50000,
      TRUST_PROXY: false,
    });
    for (const key of [
      'ANEXOS_MAX_POR_PETICION',
      'ANEXOS_MAX_POR_TICKET',
      'ANEXOS_MAX_BYTES_POR_TICKET',
      'ANOTACIONES_MAX_POR_TICKET',
      'COMUNICACIONES_MAX_POR_REMITENTE_HORA',
      'COMUNICACIONES_MAX_TOTAL',
      'IMAP_MAX_BYTES_MENSAJE',
      'PORTAL_MAX_INTENTOS',
      'PORTAL_BLOQUEO_MINUTOS',
      'PORTAL_MAX_INTENTOS_POR_CASO',
      'PORTAL_MAX_CLAVES',
    ]) {
      expect(() => validateEnvironment({ ...validEnvironment, [key]: 0 })).toThrow();
      expect(() => validateEnvironment({ ...validEnvironment, [key]: 1.5 })).toThrow();
    }
  });

  it('requires SMTP, verified TLS, and HTTPS for production mail', () => {
    const production = {
      ...validEnvironment,
      NODE_ENV: 'production',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: 'mailer',
      SMTP_PASS: 'secret-pass',
      MAIL_FROM: 'support@example.com',
      SMTP_SECURE: false,
      PORTAL_PUBLICO_URL: 'https://support.example.com',
      IMAP_HOST: 'imap.example.com',
      IMAP_PORT: 993,
      IMAP_SECURE: true,
      IMAP_USER: 'mailbox-user',
      IMAP_PASS: 'mailbox-password',
      IMAP_MAILBOX: 'INBOX',
    };
    expect(() => validateEnvironment(production)).not.toThrow();
    expect(validateEnvironment(production).SWAGGER_ENABLED).toBe(false);
    expect(() =>
      validateEnvironment({ ...production, SWAGGER_ENABLED: true }),
    ).toThrow('SWAGGER_ALLOWED_IPS');
    expect(
      validateEnvironment({
        ...production,
        SWAGGER_ENABLED: true,
        SWAGGER_ALLOWED_IPS: '127.0.0.1',
      }).SWAGGER_ENABLED,
    ).toBe(true);
    expect(() =>
      validateEnvironment({
        ...production,
        SWAGGER_ENABLED: true,
        SWAGGER_ALLOWED_IPS: 'not-an-ip',
      }),
    ).toThrow('IP no válida');
    expect(() =>
      validateEnvironment({ ...production, MAIL_TRANSPORT: 'consola' }),
    ).toThrow('MAIL_TRANSPORT=smtp');
    expect(() =>
      validateEnvironment({ ...production, MAIL_FROM: undefined }),
    ).toThrow('SMTP completa');
    expect(() =>
      validateEnvironment({ ...production, PORTAL_PUBLICO_URL: 'http://example.com' }),
    ).toThrow('HTTPS');
    expect(() =>
      validateEnvironment({ ...production, IMAP_SECURE: false }),
    ).toThrow('IMAP completo');
    expect(() =>
      validateEnvironment({ ...production, IMAP_PASS: undefined }),
    ).toThrow('IMAP_PASS');
  });

  it('prevents configuration-module startup with invalid production mail settings', async () => {
    const keys = [
      'NODE_ENV',
      'JWT_SECRET',
      'ADMIN_NAME',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'SLA_TIMEZONE',
      'MAIL_TRANSPORT',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'MAIL_FROM',
      'PORTAL_PUBLICO_URL',
      'IMAP_HOST',
      'IMAP_PORT',
      'IMAP_SECURE',
      'IMAP_USER',
      'IMAP_PASS',
      'IMAP_MAILBOX',
    ];
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      NODE_ENV: 'production',
      JWT_SECRET: validEnvironment.JWT_SECRET,
      ADMIN_NAME: validEnvironment.ADMIN_NAME,
      ADMIN_EMAIL: validEnvironment.ADMIN_EMAIL,
      ADMIN_PASSWORD: validEnvironment.ADMIN_PASSWORD,
      SLA_TIMEZONE: validEnvironment.SLA_TIMEZONE,
      MAIL_TRANSPORT: 'consola',
      PORTAL_PUBLICO_URL: 'https://support.example.com',
      IMAP_HOST: 'imap.example.com',
      IMAP_PORT: '993',
      IMAP_SECURE: 'true',
      IMAP_USER: 'mailbox-user',
      IMAP_PASS: 'mailbox-password',
      IMAP_MAILBOX: 'INBOX',
    });
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.MAIL_FROM;
    delete process.env.IMAP_HOST;
    delete process.env.IMAP_PORT;
    delete process.env.IMAP_USER;
    delete process.env.IMAP_PASS;
    delete process.env.IMAP_MAILBOX;

    try {
      await expect(
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
      ).rejects.toThrow('MAIL_TRANSPORT=smtp');

      process.env.MAIL_TRANSPORT = 'smtp';
      await expect(
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
      ).rejects.toThrow('SMTP completa');

      process.env.MAIL_TRANSPORT = 'smtp';
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'mailer';
      process.env.SMTP_PASS = 'smtp-password';
      process.env.MAIL_FROM = 'support@example.com';
      process.env.IMAP_SECURE = 'true';
      delete process.env.IMAP_HOST;
      delete process.env.IMAP_PORT;
      delete process.env.IMAP_USER;
      delete process.env.IMAP_PASS;
      delete process.env.IMAP_MAILBOX;
      await expect(
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
      ).rejects.toThrow('IMAP_HOST');
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
