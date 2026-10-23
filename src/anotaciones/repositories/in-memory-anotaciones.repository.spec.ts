import { InMemoryAnotacionesRepository } from './in-memory-anotaciones.repository.js';

describe('InMemoryAnotacionesRepository', () => {
  it('stores copies and exposes only append/list operations', async () => {
    const repository = new InMemoryAnotacionesRepository();
    const annotation = {
      id: 'annotation-1',
      ticketId: 'ticket-1',
      autorId: 'user-1',
      texto: 'Nota interna',
      fecha: '2026-01-01T00:00:00.000Z',
    };
    await repository.agregar(annotation);
    const returned = (await repository.listarPorTicket('ticket-1'))[0];
    returned.texto = 'mutada';
    annotation.texto = 'mutada en entrada';

    expect((await repository.listarPorTicket('ticket-1'))[0].texto).toBe('Nota interna');
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repository)).sort()).toEqual([
      'agregar',
      'constructor',
      'listarPorTicket',
    ]);
  });
});
