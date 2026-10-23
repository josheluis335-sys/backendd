import { Logger, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { ClockService } from '../common/clock/clock.service.js';

describe('AuthService security logging', () => {
  it('logs a generic failed login without logging the submitted password', async () => {
    const loggerSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new AuthService(
      { findByEmail: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const submittedPassword = 'very-secret-password-that-must-not-be-logged';

    await expect(
      service.login('missing@example.com', submittedPassword),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const logOutput = loggerSpy.mock.calls.flat().join(' ');
    expect(logOutput).not.toContain(submittedPassword);
    expect(logOutput).toContain('Inicio de sesión fallido.');
    expect(logOutput).not.toContain('missing@example.com');
    loggerSpy.mockRestore();
  });

  it('logs successful login with only the user id and no credentials or secret', async () => {
    const password = 'sensitive-password-value';
    const hash = await bcrypt.hash(password, 10);
    const secret = 'jwt-secret-never-for-logging';
    const loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const user = {
      id: 'user-safe-id',
      nombre: 'Agente',
      correo: 'agent@example.com',
      passwordHash: hash,
      rol: 'AGENTE',
      areaId: 'area-id',
      activo: true,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    };
    const service = new AuthService(
      { findByEmail: vi.fn().mockResolvedValue(user) } as never,
      { sign: vi.fn().mockReturnValue('sensitive-token') } as never,
      { create: vi.fn() } as never,
    );

    try {
      await service.login(user.correo, password);
      const output = loggerSpy.mock.calls.flat().join(' ');
      expect(output).toContain('user-safe-id');
      expect(output).not.toContain(user.correo);
      expect(output).not.toContain(password);
      expect(output).not.toContain(hash);
      expect(output).not.toContain(secret);
      expect(output).not.toContain('sensitive-token');
      expect(output).toContain('Inicio de sesión exitoso.');
    } finally {
      loggerSpy.mockRestore();
    }
  });

  it('logs inactivity expiration without session data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T05:00:00.000Z'));
    const loggerSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const sessions = {
      findById: vi.fn().mockResolvedValue({
        id: 'private-session-id',
        usuarioId: 'private-user-id',
        ultimaActividad: new Date('2026-10-23T04:29:00.000Z'),
      }),
      remove: vi.fn(),
    };
    const service = new AuthService({} as never, {} as never, sessions as never);

    try {
      expect(await service.validateSession('private-user-id', 'private-session-id')).toBe(false);
      const output = loggerSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Sesión caducada por inactividad.');
      expect(output).not.toContain('private-session-id');
      expect(output).not.toContain('private-user-id');
      expect(sessions.remove).toHaveBeenCalledWith('private-session-id');
    } finally {
      loggerSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('uses ClockService for 29/31-minute inactivity and renews activity on valid use', async () => {
    let now = new Date('2026-10-23T12:00:00.000Z');
    const session = {
      id: 'session-clock-test',
      usuarioId: 'user-clock-test',
      ultimaActividad: new Date(now),
    };
    const sessions = {
      findById: vi.fn().mockImplementation(async () => structuredClone(session)),
      updateActivity: vi.fn().mockImplementation(async (_id: string, activity: Date) => {
        session.ultimaActividad = new Date(activity);
      }),
      remove: vi.fn(),
    };
    const service = new AuthService(
      {} as never,
      {} as never,
      sessions as never,
      { ahora: () => new Date(now) } as ClockService,
    );

    now = new Date('2026-10-23T12:29:00.000Z');
    expect(await service.validateSession(session.usuarioId, session.id)).toBe(true);
    expect(session.ultimaActividad.toISOString()).toBe(now.toISOString());

    now = new Date('2026-10-23T12:58:00.000Z');
    expect(await service.validateSession(session.usuarioId, session.id)).toBe(true);
    expect(session.ultimaActividad.toISOString()).toBe(now.toISOString());

    now = new Date('2026-10-23T13:29:00.000Z');
    expect(await service.validateSession(session.usuarioId, session.id)).toBe(false);
    expect(sessions.remove).toHaveBeenCalledWith(session.id);
  });
});
