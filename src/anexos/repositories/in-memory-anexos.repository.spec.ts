import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { InMemoryAnexosRepository } from './in-memory-anexos.repository.js';

describe('InMemoryAnexosRepository', () => {
  it('returns detached metadata copies', async () => {
    const repository = new InMemoryAnexosRepository(new TicketActionUnitOfWork());
    await repository.agregar({
      id: 'anexo-1',
      ticketId: 'ticket-1',
      autorId: 'user-1',
      nombreOriginal: 'evidencia.pdf',
      mimeType: 'application/pdf',
      tamano: 10,
      claveAlmacenada: 'opaque-key',
      fecha: '2026-01-01T00:00:00.000Z',
    });
    const received = await repository.buscarPorId('ticket-1', 'anexo-1');
    received!.nombreOriginal = 'alterado.pdf';

    expect((await repository.listarPorTicket('ticket-1'))[0].nombreOriginal).toBe('evidencia.pdf');
  });
});
