import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { TicketStateTransitionError } from '../../tickets/state/ticket-state-machine.js';

describe('HttpExceptionFilter', () => {
  it('returns a Spanish generic 500 response without a stack trace', () => {
    const status = vi.fn();
    const json = vi.fn();
    const response = { status: status.mockReturnThis(), json };
    const request = {
      url: '/api/failure',
      body: {
        password: 'sensitive-password',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
      },
      headers: { authorization: 'Bearer sensitive-jwt-token' },
    };
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'sensitive-jwt-secret';
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    const filter = new HttpExceptionFilter();
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter.catch(
      new Error(
        'fallo interno de prueba sensitive-password $2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12345 sensitive-jwt-secret',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor.',
      path: '/api/failure',
    });
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('stack');
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('fallo interno de prueba');
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('fallo interno de prueba');
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('fallo interno de prueba');
    expect(logged).not.toContain('sensitive-password');
    expect(logged).not.toContain('$2b$10$');
    expect(logged).not.toContain('sensitive-jwt-secret');
    expect(logged).not.toContain('sensitive-jwt-token');
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
    errorSpy.mockRestore();
  });

  it('redacts JWT_SECRET from internal error logs', () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'sensitive-test-jwt-secret';
    const status = vi.fn();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: status.mockReturnThis(), json }),
        getRequest: () => ({ url: '/api/failure' }),
      }),
    } as unknown as ArgumentsHost;
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      new HttpExceptionFilter().catch(
        new Error(`Internal failure ${process.env.JWT_SECRET}`),
        host,
      );
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(
        'sensitive-test-jwt-secret',
      );
      expect(errorSpy.mock.calls.flat().join(' ')).toContain('[REDACTADO]');
    } finally {
      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
      errorSpy.mockRestore();
    }
  });

  it('redacts SMTP_PASS from internal error logs', () => {
    const previousPassword = process.env.SMTP_PASS;
    process.env.SMTP_PASS = 'sensitive-smtp-password';
    const status = vi.fn();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: status.mockReturnThis(), json }),
        getRequest: () => ({ url: '/api/failure' }),
      }),
    } as unknown as ArgumentsHost;
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      new HttpExceptionFilter().catch(
        new Error(`Internal failure ${process.env.SMTP_PASS}`),
        host,
      );
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('sensitive-smtp-password');
      expect(errorSpy.mock.calls.flat().join(' ')).toContain('[REDACTADO]');
      expect(JSON.stringify(json.mock.calls[0])).not.toContain('sensitive-smtp-password');
    } finally {
      if (previousPassword === undefined) delete process.env.SMTP_PASS;
      else process.env.SMTP_PASS = previousPassword;
      errorSpy.mockRestore();
    }
  });

  it('redacts IMAP_PASS from internal error logs and responses', () => {
    const previousPassword = process.env.IMAP_PASS;
    process.env.IMAP_PASS = 'sensitive-imap-password';
    const status = vi.fn();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: status.mockReturnThis(), json }),
        getRequest: () => ({ url: '/api/failure' }),
      }),
    } as unknown as ArgumentsHost;
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      new HttpExceptionFilter().catch(
        new Error(`Internal failure ${process.env.IMAP_PASS}`),
        host,
      );
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('sensitive-imap-password');
      expect(JSON.stringify(json.mock.calls[0])).not.toContain('sensitive-imap-password');
    } finally {
      if (previousPassword === undefined) delete process.env.IMAP_PASS;
      else process.env.IMAP_PASS = previousPassword;
      errorSpy.mockRestore();
    }
  });

  it('preserves a Spanish client error response', () => {
    const status = vi.fn();
    const json = vi.fn();
    const response = { status: status.mockReturnThis(), json };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/api/denied' }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new HttpException('No tienes permisos.', 403),
      host,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json.mock.calls[0][0].message).toBe('No tienes permisos.');
  });

  it('converts state-machine domain errors to Spanish 409 responses', () => {
    const status = vi.fn();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: status.mockReturnThis(), json }),
        getRequest: () => ({ url: '/api/tickets/1' }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new TicketStateTransitionError('Primero debes reanudar el ticket.'),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].message).toBe('Primero debes reanudar el ticket.');
  });
});
