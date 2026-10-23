import { InMemorySessionsRepository } from './in-memory-sessions.repository.js';

describe('InMemorySessionsRepository copies', () => {
  it('does not expose stored sessions or dates through create and find', async () => {
    const repository = new InMemorySessionsRepository();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const created = { id: 'session-1', usuarioId: 'user-1', ultimaActividad: createdAt };
    await repository.create(created);
    created.ultimaActividad.setFullYear(2000);
    (await repository.findById(created.id))!.ultimaActividad.setFullYear(2001);

    const newActivity = new Date('2026-02-01T00:00:00.000Z');
    await repository.updateActivity(created.id, newActivity);
    newActivity.setFullYear(2000);
    const returned = await repository.findById(created.id);
    returned!.ultimaActividad.setFullYear(2001);

    expect((await repository.findById(created.id))?.ultimaActividad.toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });
});
