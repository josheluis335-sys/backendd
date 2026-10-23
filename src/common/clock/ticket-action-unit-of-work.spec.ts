import { TicketActionUnitOfWork } from './ticket-action-unit-of-work.js';

describe('TicketActionUnitOfWork', () => {
  it('continues processing queued operations after an earlier action throws', async () => {
    const unit = new TicketActionUnitOfWork();
    const completed: string[] = [];
    const failed = unit.execute(async () => {
      throw new Error('fallo deliberado');
    });
    const following = unit.execute(async () => {
      completed.push('siguiente');
      return 'ok';
    });

    await expect(failed).rejects.toThrow('fallo deliberado');
    await expect(following).resolves.toBe('ok');
    expect(completed).toEqual(['siguiente']);
  });

  it('waits for queued actions before graceful shutdown completes', async () => {
    const unit = new TicketActionUnitOfWork();
    let finishAction!: () => void;
    const action = unit.execute(
      () =>
        new Promise<void>((resolve) => {
          finishAction = resolve;
        }),
    );
    await Promise.resolve();
    let shutdownComplete = false;
    const shutdown = unit.onApplicationShutdown().then(() => {
      shutdownComplete = true;
    });
    await Promise.resolve();
    expect(shutdownComplete).toBe(false);

    finishAction();
    await action;
    await shutdown;
    expect(shutdownComplete).toBe(true);
  });
});
