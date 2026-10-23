import { UserRole } from '../../common/enums/user-role.enum.js';
import {
  TicketChannel,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../entities/ticket.entity.js';
import { TicketVisibilityPolicy } from './ticket-visibility.policy.js';

describe('TicketVisibilityPolicy', () => {
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
    creadoPorId: 'agent-1',
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

  it('applies creator, area, and administrator visibility in one policy', async () => {
    const policy = new TicketVisibilityPolicy({
      ultimoPorTicket: vi.fn().mockResolvedValue(null),
    } as never);
    expect(await policy.canSee({ id: 'agent-1', rol: UserRole.AGENTE }, ticket)).toBe(true);
    expect(await policy.canSee({ id: 'agent-2', rol: UserRole.AGENTE }, ticket)).toBe(false);
    expect(
      await policy.canSee({ id: 'supervisor-1', rol: UserRole.SUPERVISOR, areaId: 'area-1' }, ticket),
    ).toBe(true);
    expect(
      await policy.canSee({ id: 'supervisor-2', rol: UserRole.SUPERVISOR, areaId: 'area-2' }, ticket),
    ).toBe(false);
    expect(await policy.canSee({ id: 'admin', rol: UserRole.ADMINISTRADOR }, ticket)).toBe(true);
  });
});
