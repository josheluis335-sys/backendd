import { Logger } from '@nestjs/common';
import { ComunicacionesJob } from './comunicaciones.job.js';

describe('ComunicacionesJob', () => {
  it('does not overlap mailbox polling and marks successfully processed messages as read', async () => {
    let release!: (messages: Array<{ uid: string }>) => void;
    const readUnread = vi.fn(
      () =>
        new Promise<Array<{ uid: string }>>((resolve) => {
          release = resolve;
        }),
    );
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    const reader = { readUnread, markAsRead };
    const service = { recibir: vi.fn().mockResolvedValue({ id: 'stored' }) };
    const job = new ComunicacionesJob(reader as never, service as never);

    const firstPoll = job.procesarBandeja();
    await Promise.resolve();
    await job.procesarBandeja();
    expect(readUnread).toHaveBeenCalledTimes(1);

    release([{ uid: 'imap-uid-1' }]);
    await firstPoll;
    expect(service.recibir).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith('imap-uid-1');
  });

  it('leaves a failed message unread so the next interval retries it', async () => {
    const message = { uid: 'imap-uid-2' };
    const reader = {
      readUnread: vi.fn().mockResolvedValue([message]),
      markAsRead: vi.fn().mockResolvedValue(undefined),
    };
    const service = { recibir: vi.fn().mockRejectedValue(new Error('private server detail')) };
    const job = new ComunicacionesJob(reader as never, service as never);

    await job.procesarBandeja();
    expect(reader.markAsRead).not.toHaveBeenCalled();
  });

  it('does not mark a throttled or unstored message as processed', async () => {
    const reader = {
      readUnread: vi.fn().mockResolvedValue([{ uid: 'imap-uid-3' }]),
      markAsRead: vi.fn().mockResolvedValue(undefined),
    };
    const service = { recibir: vi.fn().mockResolvedValue(null) };
    const job = new ComunicacionesJob(reader as never, service as never);
    await job.procesarBandeja();
    expect(reader.markAsRead).not.toHaveBeenCalled();
  });

  it('does not include sender addresses, subjects, or bodies in error logs', async () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const reader = {
      readUnread: vi
        .fn()
        .mockRejectedValue(
          new Error('secret-sender@example.com Private subject Secret body contents'),
        ),
      markAsRead: vi.fn(),
    };
    const job = new ComunicacionesJob(reader as never, { recibir: vi.fn() } as never);
    try {
      await job.procesarBandeja();
      const logs = loggerSpy.mock.calls.flat().join(' ');
      expect(logs).not.toContain('secret-sender@example.com');
      expect(logs).not.toContain('Private subject');
      expect(logs).not.toContain('Secret body contents');
    } finally {
      loggerSpy.mockRestore();
    }
  });

  it('waits for the active polling cycle during graceful shutdown', async () => {
    let finishRead!: () => void;
    const reader = {
      readUnread: vi.fn(
        () =>
          new Promise<Array<{ uid: string }>>((resolve) => {
            finishRead = () => resolve([]);
          }),
      ),
      markAsRead: vi.fn(),
    };
    const job = new ComunicacionesJob(reader as never, { recibir: vi.fn() } as never);
    const polling = job.procesarBandeja();
    await Promise.resolve();
    let shutdownComplete = false;
    const shutdown = job.onApplicationShutdown().then(() => {
      shutdownComplete = true;
    });
    await Promise.resolve();
    expect(shutdownComplete).toBe(false);

    finishRead();
    await polling;
    await shutdown;
    await job.procesarBandeja();
    expect(shutdownComplete).toBe(true);
    expect(reader.readUnread).toHaveBeenCalledTimes(1);
  });
});
