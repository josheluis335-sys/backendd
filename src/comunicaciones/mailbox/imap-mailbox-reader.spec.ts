import { ImapMailboxReader } from './imap-mailbox-reader.js';

const state = vi.hoisted(() => ({
  options: [] as Array<Record<string, unknown>>,
  searchResult: [7],
  item: {
    uid: 7,
    source: Buffer.from('raw email'),
    size: 100,
    internalDate: new Date('2026-10-23T11:00:00.000Z'),
    envelope: {
      messageId: '<incoming@example.com>',
      subject: 'Solicitud',
      from: [{ name: 'Solicitante', address: 'user@example.com' }],
    },
  },
  addedFlags: [] as Array<{ uid: number; flags: string[] }>,
  parsed: vi.fn(),
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    constructor(options: Record<string, unknown>) {
      state.options.push(options);
    }

    async connect() {}

    async getMailboxLock() {
      return { release: vi.fn() };
    }

    async search() {
      return state.searchResult;
    }

    async *fetch() {
      if (state.item) yield state.item;
    }

    async messageFlagsAdd(uid: number, flags: string[]) {
      state.addedFlags.push({ uid, flags });
    }

    async logout() {}
  },
}));

vi.mock('mailparser', () => ({
  simpleParser: state.parsed,
}));

describe('ImapMailboxReader', () => {
  beforeEach(() => {
    state.options.length = 0;
    state.addedFlags.length = 0;
    state.parsed.mockClear();
    state.searchResult = [7];
    state.item = {
      uid: 7,
      source: Buffer.from('raw email'),
      size: 100,
      internalDate: new Date('2026-10-23T11:00:00.000Z'),
      envelope: {
        messageId: '<incoming@example.com>',
        subject: 'Solicitud',
        from: [{ name: 'Solicitante', address: 'user@example.com' }],
      },
    };
    state.parsed.mockResolvedValue({
      messageId: '<incoming@example.com>',
      from: { value: [{ name: 'Solicitante', address: 'user@example.com' }] },
      subject: 'Solicitud',
      text: 'Necesito ayuda.',
      date: new Date('2026-10-23T10:59:00.000Z'),
      headers: new Map([['auto-submitted', 'no']]),
    });
  });

  it('reads unread messages with verified TLS and parses only plain-text fields', async () => {
    const config = {
      getOrThrow: (key: string) =>
        ({
          IMAP_HOST: 'imap.example.com',
          IMAP_PORT: 993,
          IMAP_USER: 'user',
          IMAP_PASS: 'secret',
        })[key],
      get: (key: string, fallback?: unknown) =>
        key === 'IMAP_SECURE' ? true : key === 'IMAP_MAILBOX' ? 'INBOX' : fallback,
    };
    const reader = new ImapMailboxReader(
      config as never,
      { ahora: () => new Date('2026-10-23T12:00:00.000Z') } as never,
    );

    const messages = await reader.readUnread();
    expect(messages).toMatchObject([
      {
        uid: '7',
        messageId: '<incoming@example.com>',
        remitenteNombre: 'Solicitante',
        remitenteCorreo: 'user@example.com',
        asunto: 'Solicitud',
        cuerpo: 'Necesito ayuda.',
      },
    ]);
    expect(state.options[0]).toMatchObject({
      secure: true,
      tls: { rejectUnauthorized: true },
      logger: false,
      auth: { pass: 'secret' },
    });
  });

  it('marks the fetched UID as read only after processing', async () => {
    const config = {
      getOrThrow: (key: string) =>
        ({
          IMAP_HOST: 'localhost',
          IMAP_PORT: 1143,
          IMAP_USER: 'dev',
          IMAP_PASS: 'dev',
        })[key],
      get: (_key: string, fallback?: unknown) => fallback,
    };
    const reader = new ImapMailboxReader(
      config as never,
      { ahora: () => new Date('2026-10-23T12:00:00.000Z') } as never,
    );
    await reader.markAsRead('7');
    expect(state.addedFlags).toEqual([{ uid: 7, flags: ['\\Seen'] }]);
  });

  it('converts HTML-only content to safe text and ignores attachments', async () => {
    state.parsed.mockResolvedValue({
      messageId: '<incoming@example.com>',
      from: { value: [{ name: 'Solicitante', address: 'user@example.com' }] },
      subject: 'Solicitud HTML',
      html: '<main>Necesito ayuda.<script>secreto del script</script></main>',
      text: 'Necesito ayuda.',
      attachments: [{ filename: 'privado.txt', content: Buffer.from('adjunto secreto') }],
      headers: new Map([['auto-submitted', 'no']]),
    });
    const config = {
      getOrThrow: (key: string) =>
        ({
          IMAP_HOST: 'localhost',
          IMAP_PORT: 1143,
          IMAP_USER: 'dev',
          IMAP_PASS: 'dev',
        })[key],
      get: (_key: string, fallback?: unknown) => fallback,
    };
    const reader = new ImapMailboxReader(
      config as never,
      { ahora: () => new Date('2026-10-23T12:00:00.000Z') } as never,
    );
    const messages = await reader.readUnread();
    expect(messages[0].cuerpo).toContain('Necesito ayuda.');
    expect(messages[0].cuerpo).not.toContain('<script>');
    expect(messages[0].cuerpo).not.toContain('secreto del script');
    expect(messages[0].cuerpo).not.toContain('adjunto secreto');
    expect(messages[0]).not.toHaveProperty('html');
  });

  it('does not download the source of a message exceeding the configurable 5 MiB limit', async () => {
    state.item.size = 5_242_881;
    const config = {
      getOrThrow: (key: string) =>
        ({
          IMAP_HOST: 'localhost',
          IMAP_PORT: 1143,
          IMAP_USER: 'dev',
          IMAP_PASS: 'dev',
        })[key],
      get: (_key: string, fallback?: unknown) => fallback,
    };
    const reader = new ImapMailboxReader(
      config as never,
      { ahora: () => new Date('2026-10-23T12:00:00.000Z') } as never,
    );
    const messages = await reader.readUnread();
    expect(messages[0]).toMatchObject({
      tamanoExcedido: true,
      cuerpo: '',
      messageId: '<incoming@example.com>',
    });
    expect(state.parsed).not.toHaveBeenCalled();
  });
});
