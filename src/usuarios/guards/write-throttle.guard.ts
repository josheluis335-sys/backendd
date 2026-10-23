import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service.js';

const WRITE_WINDOW_MS = 60_000;
const WRITE_MAX_ATTEMPTS = 30;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

@Injectable()
export class WriteThrottleGuard implements CanActivate {
  private readonly logger = new Logger(WriteThrottleGuard.name);
  private readonly attempts = new Map<string, number[]>();

  constructor(
    @Optional()
    @Inject(ClockService)
    private readonly clock = new ClockService(),
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      route?: { path?: string };
    }>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const route = request.route?.path ?? 'write';
    const key = `${ip}:${route}`;
    const limit = route.includes('restablecer-password')
      ? PASSWORD_RESET_MAX_ATTEMPTS
      : WRITE_MAX_ATTEMPTS;
    const now = this.clock.ahora().getTime();
    const recent = (this.attempts.get(key) ?? []).filter(
      (attempt) => now - attempt < WRITE_WINDOW_MS,
    );
    if (recent.length >= limit) {
      this.attempts.set(key, recent);
      this.logger.warn('Límite de operaciones de escritura excedido.');
      throw new HttpException(
        'Demasiadas solicitudes de escritura. Inténtalo de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }
}
