import { HttpException, Logger } from '@nestjs/common';
import { LoginThrottleGuard } from './login-throttle.guard.js';

describe('LoginThrottleGuard', () => {
  it('returns 429 on attempt six for the same IP/email and tracks another email separately', () => {
    const guard = new LoginThrottleGuard();
    const loggerSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const contextFor = (correo: string) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '192.0.2.1',
          body: { correo },
        }),
      }),
    });
    const agentContext = contextFor('Agent@Example.com');
    const otherEmailContext = contextFor('other@example.com');

    for (let attempt = 0; attempt < 5; attempt++) {
      expect(guard.canActivate(agentContext as never)).toBe(true);
    }
    let sixthAttemptError: unknown;
    try {
      guard.canActivate(agentContext as never);
    } catch (error) {
      sixthAttemptError = error;
    }
    expect(sixthAttemptError).toBeInstanceOf(HttpException);
    expect((sixthAttemptError as HttpException).getStatus()).toBe(429);
    expect(loggerSpy.mock.calls.flat().join(' ')).toContain(
      'Límite de intentos de inicio de sesión excedido.',
    );
    expect(loggerSpy.mock.calls.flat().join(' ')).not.toContain('Agent@Example.com');

    expect(guard.canActivate(otherEmailContext as never)).toBe(true);
    loggerSpy.mockRestore();
  });
});
