import { TicketActionUnitOfWork } from '../../common/clock/ticket-action-unit-of-work.js';
import { ComunicacionEstado } from '../entities/comunicacion.entity.js';
import { InMemoryComunicacionesRepository } from './in-memory-comunicaciones.repository.js';

const communication = {
  id: 'communication-id',
  messageId: 'message-id@example.com',
  remitenteNombre: 'Solicitante',
  remitenteCorreo: 'solicitante@example.com',
  asunto: 'Asunto',
  cuerpo: 'Cuerpo del mensaje',
  fechaRecepcion: new Date('2026-10-23T12:00:00.000Z'),
  ingresadoEn: new Date('2026-10-23T12:00:00.000Z'),
  estado: ComunicacionEstado.PENDIENTE,
  motivoDescarte: null,
  ticketId: null,
};

describe('InMemoryComunicacionesRepository', () => {
  it('atomically inserts a messageId at most once', async () => {
    const repository = new InMemoryComunicacionesRepository();
    const results = await Promise.all([
      repository.insertarSiNuevo(communication, 10),
      repository.insertarSiNuevo({ ...communication, id: 'second-id' }, 10),
    ]);
    expect(results.sort((left, right) => left.localeCompare(right))).toEqual([
      'DUPLICATE',
      'INSERTED',
    ]);
    expect(await repository.listar()).toHaveLength(1);
  });

  it('rolls back email conversion if a later unit-of-work commit fails', async () => {
    const unitOfWork = new TicketActionUnitOfWork();
    const repository = new InMemoryComunicacionesRepository(unitOfWork);
    await repository.insertarSiNuevo(communication, 10);

    await expect(
      unitOfWork.execute(async () => {
        await repository.marcarConvertido(communication.id, 'ticket-id');
        await unitOfWork.stage(() => {
          throw new Error('commit failure');
        });
      }),
    ).rejects.toThrow('commit failure');
    expect(await repository.buscarPorId(communication.id)).toMatchObject({
      estado: ComunicacionEstado.PENDIENTE,
      ticketId: null,
    });
  });
});
