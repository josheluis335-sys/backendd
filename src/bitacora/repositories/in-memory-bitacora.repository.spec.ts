import { EventoBitacoraTipo } from '../entities/evento-bitacora.entity.js';
import { InMemoryBitacoraRepository } from './in-memory-bitacora.repository.js';

describe('InMemoryBitacoraRepository', () => {
  it('freezes stored events, returns copies, and exposes no edit/delete methods', async () => {
    const repository = new InMemoryBitacoraRepository();
    const event = {
      id: 'event-1',
      ticketId: 'ticket-1',
      tipo: EventoBitacoraTipo.CREACION,
      detalle: { numero: 'INC0001' },
      usuarioId: 'user-1',
      fecha: '2026-10-23T10:00:00.000Z',
    };
    await repository.agregar(event);
    const returned = (await repository.listarPorTicket('ticket-1'))[0];
    returned.detalle.numero = 'alterado';
    returned.tipo = EventoBitacoraTipo.CIERRE;
    event.detalle.numero = 'mutación de entrada';

    expect((await repository.listarPorTicket('ticket-1'))[0]).toMatchObject({
      tipo: EventoBitacoraTipo.CREACION,
      detalle: { numero: 'INC0001' },
    });
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(repository)).sort(),
    ).toEqual(['agregar', 'constructor', 'listarPorTicket']);
  });
});
