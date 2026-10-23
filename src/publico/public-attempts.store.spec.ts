import { InMemoryPublicAttemptsStore } from './public-attempts.store.js';

describe('InMemoryPublicAttemptsStore', () => {
  let now: Date;
  let options: Record<string, number>;
  let store: InMemoryPublicAttemptsStore;

  beforeEach(() => {
    now = new Date('2026-10-23T12:00:00.000Z');
    options = {
      PORTAL_MAX_INTENTOS: 5,
      PORTAL_BLOQUEO_MINUTOS: 5,
      PORTAL_MAX_INTENTOS_POR_CASO: 30,
      PORTAL_MAX_CLAVES: 50000,
    };
    store = new InMemoryPublicAttemptsStore(
      { get: (key: string, fallback?: number) => options[key] ?? fallback } as never,
      { ahora: () => new Date(now) } as never,
    );
  });

  it('locks the IP+case key on the fifth consecutive failure', () => {
    for (let index = 0; index < 4; index++) {
      expect(store.failure('ip-a', 'INC0001').blocked).toBe(false);
    }
    expect(store.failure('ip-a', 'INC0001').blocked).toBe(false);
    expect(store.blocked('ip-a', 'INC0001')).toMatchObject({
      blocked: true,
      retryAfterSeconds: 300,
    });
  });

  it('atomically blocks exactly after the threshold under concurrent failures', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 20 }, async () => store.failure('ip-a', 'INC0001')),
    );
    expect(decisions.filter(({ blocked }) => !blocked)).toHaveLength(5);
    expect(decisions.filter(({ blocked }) => blocked)).toHaveLength(15);
    expect(store.blocked('ip-a', 'INC0001').blocked).toBe(true);
  });

  it('resets only the IP+case counter on success', () => {
    for (let index = 0; index < 4; index++) store.failure('ip-a', 'INC0001');
    store.success('ip-a', 'INC0001');
    for (let index = 0; index < 20; index++) {
      store.failure('ip-a', `REQ${String(index + 1).padStart(4, '0')}`);
    }
    expect(store.failure('ip-a', 'REQ0021').blocked).toBe(false);
    expect(store.blocked('ip-a', 'INC0001').blocked).toBe(true);
  });

  it('applies the global-per-case threshold across different IPs', () => {
    options.PORTAL_MAX_INTENTOS_POR_CASO = 2;
    store = new InMemoryPublicAttemptsStore(
      { get: (key: string, fallback?: number) => options[key] ?? fallback } as never,
      { ahora: () => new Date(now) } as never,
    );
    store.failure('ip-a', 'INC0001');
    expect(store.failure('ip-b', 'INC0001').blocked).toBe(false);
    expect(store.blocked('ip-c', 'INC0001').blocked).toBe(true);
  });

  it('expires counters with the injected ClockService and cleans expired keys', () => {
    store.failure('ip-a', 'INC0001');
    expect(store.clearExpired()).toBe(0);
    now = new Date(now.getTime() + 5 * 60 * 1000);
    expect(store.clearExpired()).toBe(3);
    expect(store.blocked('ip-a', 'INC0001').blocked).toBe(false);
  });

  it('rejects new keys when the memory cap is reached without growing the store', () => {
    options.PORTAL_MAX_CLAVES = 3;
    store = new InMemoryPublicAttemptsStore(
      { get: (key: string, fallback?: number) => options[key] ?? fallback } as never,
      { ahora: () => new Date(now) } as never,
    );
    expect(store.failure('ip-a', 'INC0001').blocked).toBe(false);
    expect(store.keyCount()).toBe(3);
    expect(store.failure('ip-b', 'INC0002').blocked).toBe(true);
    expect(store.keyCount()).toBe(3);
  });

  it('cleans expired keys before enforcing the memory cap', () => {
    options.PORTAL_MAX_CLAVES = 3;
    store = new InMemoryPublicAttemptsStore(
      { get: (key: string, fallback?: number) => options[key] ?? fallback } as never,
      { ahora: () => new Date(now) } as never,
    );
    store.failure('ip-a', 'INC0001');
    expect(store.keyCount()).toBe(3);
    now = new Date(now.getTime() + 5 * 60 * 1000);
    expect(store.blocked('ip-b', 'INC0002').blocked).toBe(false);
    expect(store.keyCount()).toBe(0);
  });
});
