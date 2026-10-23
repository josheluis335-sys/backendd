import Joi from 'joi';
import { isIP } from 'node:net';
import { isValidTimezone } from '../sla/sla.config.js';

const EXAMPLE_JWT_SECRET =
  'replace-with-a-random-secret-of-at-least-32-characters';

const environmentSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  APP_NAME: Joi.string().default('Mesa de Servicio'),
  APP_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  NODE_ENV: Joi.string().valid('development', 'test', 'production'),
  JWT_SECRET: Joi.string()
    .min(32)
    .invalid(EXAMPLE_JWT_SECRET)
    .required()
    .messages({
      'any.required': 'JWT_SECRET es obligatorio.',
      'string.min': 'JWT_SECRET debe tener al menos 32 caracteres.',
      'any.invalid': 'JWT_SECRET no puede conservar el valor de ejemplo.',
    }),
  JWT_EXPIRES_IN: Joi.string().pattern(/^\d+[smhd]$/).default('8h'),
  ADMIN_NAME: Joi.string().trim().min(2).required(),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string()
    .min(10)
    .invalid('replace-with-a-unique-password')
    .custom((value, helpers) => {
      if (!/\p{L}/u.test(value) || !/\d/.test(value)) {
        return helpers.error('string.passwordPolicy');
      }
      if (Buffer.byteLength(value, 'utf8') > 72 || value !== value.trim()) {
        return helpers.error('string.passwordPolicy');
      }
      return value;
    })
    .messages({
      'string.passwordPolicy': 'ADMIN_PASSWORD no cumple la política de contraseñas.',
    })
    .required(),
  ADMIN_AREA_NOMBRE: Joi.string().trim().min(1).default('Seguridad y accesos'),
  DEV_AGENT_NAME: Joi.string().optional(),
  DEV_AGENT_EMAIL: Joi.string().email().optional(),
  DEV_AGENT_PASSWORD: Joi.string().optional(),
  DEV_SUPERVISOR_NAME: Joi.string().optional(),
  DEV_SUPERVISOR_EMAIL: Joi.string().email().optional(),
  DEV_SUPERVISOR_PASSWORD: Joi.string().optional(),
  SLA_TIMEZONE: Joi.string()
    .required()
    .custom((value, helpers) =>
      isValidTimezone(value) ? value : helpers.error('string.timezone'),
    )
    .messages({
      'any.required': 'SLA_TIMEZONE es obligatorio.',
      'string.timezone': 'SLA_TIMEZONE debe ser una zona IANA válida.',
    }),
  SLA_HORA_INICIO: Joi.number().integer().min(0).max(23).default(8),
  SLA_HORA_FIN: Joi.number().integer().min(0).max(23).default(17),
  SLA_UMBRAL_PROXIMO: Joi.number().greater(0).less(1).default(0.8),
  SLA_FESTIVOS: Joi.string()
    .allow('')
    .default('')
    .custom((value, helpers) => {
      const holidays = value.split(',').map((date: string) => date.trim()).filter(Boolean);
      const valid = holidays.every((date: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
        const [year, month, day] = date.split('-').map(Number);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
      });
      return valid ? value : helpers.error('string.holidays');
    })
    .messages({ 'string.holidays': 'SLA_FESTIVOS contiene una fecha no válida (AAAA-MM-DD).' }),
  SLA_ALERT_PERCENT: Joi.number().min(1).max(100).default(80),
  TZ: Joi.string().default('America/Mexico_City'),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional(),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  MAIL_FROM: Joi.string().email().optional(),
  MAIL_TRANSPORT: Joi.string().valid('smtp', 'consola').default('consola'),
  MAIL_TIMEOUT_MS: Joi.number().integer().positive().default(5000),
  PORTAL_PUBLICO_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:3000'),
  NOTIFICACIONES_MAX_POR_TICKET: Joi.number().integer().positive().default(20),
  IMAP_HOST: Joi.string().trim().min(1).optional(),
  IMAP_PORT: Joi.number().port().optional(),
  IMAP_SECURE: Joi.boolean().default(false),
  IMAP_USER: Joi.string().trim().min(1).optional(),
  IMAP_PASS: Joi.string().min(1).optional(),
  IMAP_MAILBOX: Joi.string().trim().min(1).optional(),
  COMUNICACIONES_MAX_POR_REMITENTE_HORA: Joi.number().integer().positive().default(20),
  COMUNICACIONES_MAX_TOTAL: Joi.number().integer().positive().default(2000),
  IMAP_MAX_BYTES_MENSAJE: Joi.number().integer().positive().default(5_242_880),
  CORREO_DOMINIOS_PERMITIDOS: Joi.string()
    .allow('')
    .default('')
    .custom((value, helpers) => {
      const domains = value
        .split(',')
        .map((domain: string) => domain.trim())
        .filter(Boolean);
      return domains.every((domain: string) =>
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain),
      )
        ? value
        : helpers.error('string.allowedDomains');
    })
    .messages({
      'string.allowedDomains':
        'CORREO_DOMINIOS_PERMITIDOS debe ser una lista de dominios separados por comas.',
    }),
  PORTAL_MAX_INTENTOS: Joi.number().integer().positive().default(5),
  PORTAL_BLOQUEO_MINUTOS: Joi.number().integer().positive().default(5),
  PORTAL_MAX_INTENTOS_POR_CASO: Joi.number().integer().positive().default(30),
  PORTAL_MAX_CLAVES: Joi.number().integer().positive().default(50000),
  PORTAL_ORIGENES_PERMITIDOS: Joi.string()
    .allow('')
    .default('')
    .custom((value, helpers) => {
      const origins = value.split(',').map((origin: string) => origin.trim()).filter(Boolean);
      const valid = origins.every((origin: string) => {
        try {
          const parsed = new URL(origin);
          return (
            ['http:', 'https:'].includes(parsed.protocol) &&
            parsed.origin === origin &&
            parsed.username === '' &&
            parsed.password === ''
          );
        } catch {
          return false;
        }
      });
      return valid ? value : helpers.error('string.portalOrigins');
    })
    .messages({
      'string.portalOrigins':
        'PORTAL_ORIGENES_PERMITIDOS debe contener orígenes HTTP(S) separados por comas.',
    }),
  TRUST_PROXY: Joi.boolean().default(false),
  SUPPORT_CORS_ORIGINS: Joi.string()
    .allow('')
    .default('')
    .custom((value, helpers) => {
      const origins = value.split(',').map((origin: string) => origin.trim()).filter(Boolean);
      const valid = origins.every((origin: string) => {
        try {
          const parsed = new URL(origin);
          return (
            ['http:', 'https:'].includes(parsed.protocol) &&
            parsed.origin === origin &&
            parsed.username === '' &&
            parsed.password === ''
          );
        } catch {
          return false;
        }
      });
      return valid ? value : helpers.error('string.supportOrigins');
    })
    .messages({
      'string.supportOrigins':
        'SUPPORT_CORS_ORIGINS debe contener orígenes HTTP(S) separados por comas.',
    }),
  SWAGGER_ENABLED: Joi.boolean(),
  SWAGGER_ALLOWED_IPS: Joi.string().allow('').default(''),
  UPLOADS_DIR: Joi.string().trim().min(1).default('./uploads'),
  ANEXOS_MAX_POR_PETICION: Joi.number().integer().positive().default(5),
  ANEXOS_MAX_POR_TICKET: Joi.number().integer().positive().default(50),
  ANEXOS_MAX_BYTES_POR_TICKET: Joi.number().integer().positive().default(52_428_800),
  ANOTACIONES_MAX_POR_TICKET: Joi.number().integer().positive().default(200),
})
  .custom((value, helpers) => {
    if (value.NODE_ENV === 'production') {
      const requiredMail = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
      const missing = requiredMail.filter((key) => !value[key]);
      if (value.MAIL_TRANSPORT !== 'smtp' || missing.length > 0) {
        return helpers.error('object.productionMail', { missing: missing.join(', ') });
      }
      if (value.SWAGGER_ENABLED === true && !value.SWAGGER_ALLOWED_IPS) {
        return helpers.error('object.swaggerAccess');
      }
      if (!String(value.PORTAL_PUBLICO_URL).startsWith('https://')) {
        return helpers.error('object.productionPortal');
      }
      const requiredImap = ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASS', 'IMAP_MAILBOX'];
      const missingImap = requiredImap.filter((key) => !value[key]);
      if (missingImap.length > 0 || value.IMAP_SECURE !== true) {
        return helpers.error('object.productionImap', {
          missing: missingImap.join(', '),
        });
      }
    }
    if (value.SLA_HORA_INICIO >= value.SLA_HORA_FIN) {
      return helpers.error('object.slaHours');
    }
    return value;
  })
  .unknown(true)
  .custom((value, helpers) => {
    if (value.NODE_ENV === 'development') {
      const requiredDevelopmentValues = [
        'DEV_AGENT_NAME',
        'DEV_AGENT_EMAIL',
        'DEV_AGENT_PASSWORD',
        'DEV_SUPERVISOR_NAME',
        'DEV_SUPERVISOR_EMAIL',
        'DEV_SUPERVISOR_PASSWORD',
      ];
      const missing = requiredDevelopmentValues.filter((key) => !value[key]);
      if (missing.length > 0) {
        return helpers.error('object.developmentSeed', { missing: missing.join(', ') });
      }
    }
    return value;
  })
  .messages({
    'object.slaHours': 'SLA_HORA_INICIO debe ser menor que SLA_HORA_FIN.',
    'object.productionMail':
      'En producción exige MAIL_TRANSPORT=smtp y configuración SMTP completa: {{#missing}}.',
    'object.productionPortal': 'PORTAL_PUBLICO_URL debe usar HTTPS en producción.',
    'object.productionImap':
      'En producción exige IMAP completo y IMAP_SECURE=true: {{#missing}}.',
    'object.developmentSeed':
      'Faltan variables del seed de desarrollo: {{#missing}}.',
    'object.swaggerAccess':
      'SWAGGER_ALLOWED_IPS es obligatorio cuando Swagger está habilitado en producción.',
    'string.allowedDomains': 'CORREO_DOMINIOS_PERMITIDOS contiene dominios inválidos.',
  });

export function validateEnvironment(environment: Record<string, unknown>) {
  const defaults =
    environment.NODE_ENV === 'production'
      ? {}
      : {
          IMAP_HOST: 'localhost',
          IMAP_PORT: 1143,
          IMAP_USER: 'dev',
          IMAP_PASS: 'dev',
          IMAP_MAILBOX: 'INBOX',
        };
  const { error, value } = environmentSchema.validate(
    { ...defaults, ...environment },
    {
    abortEarly: false,
    convert: true,
    },
  );

  if (error) {
    throw new Error(`Configuración inválida: ${error.message}`);
  }

  const validated = value as Record<string, unknown>;
  if (validated.SWAGGER_ENABLED === undefined) {
    validated.SWAGGER_ENABLED = validated.NODE_ENV !== 'production';
  }
  const swaggerIpsValue = validated.SWAGGER_ALLOWED_IPS;
  const swaggerIps =
    typeof swaggerIpsValue === 'string'
      ? swaggerIpsValue
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
      : [];
  if (swaggerIps.some((ip) => isIP(ip) === 0)) {
    throw new Error('Configuración inválida: SWAGGER_ALLOWED_IPS contiene una IP no válida.');
  }
  return validated;
}
