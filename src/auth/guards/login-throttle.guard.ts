import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service.js';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly attempts = new Map<string, number[]>();
  private readonly logger = new Logger(LoginThrottleGuard.name);

  constructor(
    @Optional()
    @Inject(ClockService)
    private readonly clock = new ClockService(),
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      body?: { correo?: unknown };
    }>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const correo =
      typeof request.body?.correo === 'string'
        ? request.body.correo.trim().toLowerCase()
        : '';
    const key = `${ip}:${correo}`;
    const now = this.clock.ahora().getTime();
    const recentAttempts = (this.attempts.get(key) ?? []).filter(
      (attempt) => now - attempt < WINDOW_MS,
    );

    if (recentAttempts.length >= MAX_ATTEMPTS) {
      this.attempts.set(key, recentAttempts);
      this.logger.warn('Límite de intentos de inicio de sesión excedido.');
      throw new HttpException(
        'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }
}
