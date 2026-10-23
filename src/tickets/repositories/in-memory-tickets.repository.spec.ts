import { TicketChannel, TicketPriority, TicketStatus, TicketType } from '../entities/ticket.entity.js';
import { InMemoryTicketsRepository } from './in-memory-tickets.repository.js';
import { TicketVersionConflictError } from '../interfaces/tickets.repository.interface.js';

describe('InMemoryTicketsRepository copies', () => {
  it('does not expose stored tickets or dates through create and queries', async () => {
    const repository = new InMemoryTicketsRepository();
    const ticket = {
      id: 'ticket-1',
      version: 1,
      tipo: TicketType.INC,
      consecutivo: 1,
      numero: 'INC0001',
      titulo: 'Error de acceso',
      descripcion: 'El usuario no puede iniciar sesión.',
      categoriaId: 'category-1',
      prioridad: TicketPriority.ALTA,
      canal: TicketChannel.CHAT,
      solicitanteNombre: 'Solicitante',
      solicitanteCorreo: 'solicitante@example.com',
      estado: TicketStatus.NUEVO,
      areaActualId: 'area-1',
      creadoPorId: 'user-1',
      fechaCreacion: new Date(),
      fechaUltimaActualizacion: new Date(),
      tiempoPausaAcumuladoSeg: 0,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
      solucion: null,
      fechaCierre: null,
    };
    const returned = await repository.create(ticket);
    returned.titulo = 'alterado';
    returned.fechaCreacion.setFullYear(2000);
    (await repository.findAll())[0].numero = 'alterado';

    const stored = await repository.findById(ticket.id);
    expect(stored?.titulo).toBe('Error de acceso');
    expect(stored?.numero).toBe('INC0001');
    expect(stored?.fechaCreacion.getFullYear()).not.toBe(2000);
  });

  it('updates only the expected version and increments it', async () => {
    const repository = new InMemoryTicketsRepository();
    const ticket = {
      id: 'ticket-1',
      version: 1,
      tipo: TicketType.INC,
      consecutivo: 1,
      numero: 'INC0001',
      titulo: 'Error de acceso',
      descripcion: 'El usuario no puede iniciar sesión.',
      categoriaId: 'category-1',
      prioridad: TicketPriority.ALTA,
      canal: TicketChannel.CHAT,
      solicitanteNombre: 'Solicitante',
      solicitanteCorreo: 'solicitante@example.com',
      estado: TicketStatus.NUEVO,
      areaActualId: 'area-1',
      creadoPorId: 'user-1',
      fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
      fechaUltimaActualizacion: new Date('2026-01-01T00:00:00.000Z'),
      tiempoPausaAcumuladoSeg: 0,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
      solucion: null,
      fechaCierre: null,
    };
    await repository.create(ticket);

    const update = await repository.actualizar(
      { ...ticket, titulo: 'Nuevo título' },
      1,
    );
    expect(update.version).toBe(2);
    await expect(repository.actualizar(ticket, 1)).rejects.toBeInstanceOf(
      TicketVersionConflictError,
    );
  });
});
