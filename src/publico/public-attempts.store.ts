import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../common/clock/clock.service.js';
import type {
  AttemptDecision,
  PublicAttemptsStore,
} from './interfaces/public-attempts-store.interface.js';

interface AttemptCounter {
  failures: number[];
  blockedUntil: number;
}

@Injectable()
export class InMemoryPublicAttemptsStore implements PublicAttemptsStore {
  private readonly counters = new Map<string, AttemptCounter>();

  constructor(
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  blocked(ip: string, caseNumber: string): AttemptDecision {
    const now = this.clock.ahora().getTime();
    this.cleanupAt(now);
    const keys = this.keys(ip, caseNumber);
    if (this.wouldExceedCapacity(keys)) return this.blockedDecision(this.windowMs());
    return this.blockedFor(keys, now);
  }

  failure(ip: string, caseNumber: string): AttemptDecision {
    const now = this.clock.ahora().getTime();
    this.cleanupAt(now);
    const keys = this.keys(ip, caseNumber);
    const alreadyBlocked = this.blockedFor(keys, now);
    if (alreadyBlocked.blocked) return alreadyBlocked;
    if (this.wouldExceedCapacity(keys)) return this.blockedDecision(this.windowMs());

    const thresholds = [
      this.config.get<number>('PORTAL_MAX_INTENTOS', 5),
      this.config.get<number>('PORTAL_MAX_INTENTOS', 5) * 5,
      this.config.get<number>('PORTAL_MAX_INTENTOS_POR_CASO', 30),
    ];
    const windowMs = this.windowMs();
    keys.forEach((key, index) => {
      const counter = this.counterFor(key);
      counter.failures = counter.failures.filter((failure) => now - failure < windowMs);
      counter.failures.push(now);
      if (counter.failures.length >= thresholds[index]) {
        counter.blockedUntil = now + windowMs;
      }
    });
    return { blocked: false, retryAfterSeconds: 0 };
  }

  success(ip: string, caseNumber: string): void {
    const pairKey = this.keys(ip, caseNumber)[0];
    this.counters.delete(pairKey);
  }

  clearExpired(): number {
    return this.cleanupAt(this.clock.ahora().getTime());
  }

  keyCount(): number {
    return this.counters.size;
  }

  reset(): void {
    this.counters.clear();
  }

  private keys(ip: string, caseNumber: string): [string, string, string] {
    return [`ip-case:${ip}:${caseNumber}`, `ip:${ip}`, `case:${caseNumber}`];
  }

  private blockedFor(keys: string[], now: number): AttemptDecision {
    const blockedUntil = Math.max(
      0,
      ...keys.map((key) => this.counters.get(key)?.blockedUntil ?? 0),
    );
    if (blockedUntil <= now) return { blocked: false, retryAfterSeconds: 0 };
    return this.blockedDecision(blockedUntil - now);
  }

  private blockedDecision(remainingMs: number): AttemptDecision {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  private windowMs(): number {
    return this.config.get<number>('PORTAL_BLOQUEO_MINUTOS', 5) * 60_000;
  }

  private counterFor(key: string): AttemptCounter {
    let counter = this.counters.get(key);
    if (!counter) {
      counter = { failures: [], blockedUntil: 0 };
      this.counters.set(key, counter);
    }
    return counter;
  }

  private wouldExceedCapacity(keys: string[]): boolean {
    const missing = keys.filter((key) => !this.counters.has(key)).length;
    return this.counters.size + missing > this.config.get<number>('PORTAL_MAX_CLAVES', 50000);
  }

  private cleanupAt(now: number): number {
    const windowMs = this.windowMs();
    let removed = 0;
    for (const [key, counter] of this.counters) {
      counter.failures = counter.failures.filter((failure) => now - failure < windowMs);
      if (counter.blockedUntil <= now && counter.failures.length === 0) {
        this.counters.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
