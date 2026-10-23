import { Injectable, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class TicketActionUnitOfWork implements OnApplicationShutdown {
  private queue: Promise<void> = Promise.resolve();
  private staged:
    | Array<{ commit: () => void | Promise<void>; rollback: () => void | Promise<void> }>
    | null = null;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.staged = [];
    try {
      const result = await operation();
      const attempted: Array<{
        commit: () => void | Promise<void>;
        rollback: () => void | Promise<void>;
      }> = [];
      try {
        for (const operation of this.staged) {
          attempted.push(operation);
          await operation.commit();
        }
      } catch (error) {
        const rollbackErrors: unknown[] = [];
        for (const operation of attempted.reverse()) {
          try {
            await operation.rollback();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length > 0) {
          throw new AggregateError(
            [error, ...rollbackErrors],
            'Falló la confirmación y al menos una reversión de la unidad de trabajo.',
          );
        }
        throw error;
      }
      return result;
    } finally {
      this.staged = null;
      release();
    }
  }

  stage(
    commit: () => void | Promise<void>,
    rollback: () => void | Promise<void> = () => undefined,
  ): void | Promise<void> {
    if (this.staged) {
      this.staged.push({ commit, rollback });
      return;
    }
    return commit();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue;
  }
}
