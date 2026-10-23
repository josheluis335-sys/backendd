import { InMemoryEscalamientosRepository } from './in-memory-escalamientos.repository.js';

describe('InMemoryEscalamientosRepository', () => {
  it('returns copies and exposes only append/list operations', async () => {
    const repository = new InMemoryEscalamientosRepository();
    const record = {
      id: 'escalamiento-1',
      ticketId: 'ticket-1',
      areaId: 'area-1',
      asignadoPorId: 'user-1',
      recibidoPorId: 'user-2',
      fecha: '2026-01-01T00:00:00.000Z',
      comentario: 'Se transfiere a soporte.',
    };
    await repository.agregar(record);
    const returned = (await repository.listarPorTicket(record.ticketId))[0];
    returned.comentario = 'mutado';
    record.comentario = 'mutación de entrada';

    expect((await repository.listarPorTicket(record.ticketId))[0].comentario).toBe(
      'Se transfiere a soporte.',
    );
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(repository)).sort(),
    ).toEqual(['agregar', 'constructor', 'listarPorTicket', 'listarPorTickets']);
    expect(await repository.listarPorTickets(['ticket-1', 'missing'])).toEqual(
      new Map([
        ['ticket-1', [expect.objectContaining({ id: 'escalamiento-1' })]],
        ['missing', []],
      ]),
    );
  });
});
