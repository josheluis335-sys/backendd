import { toPublicTicketResponse, toSupportTicketResponse } from './ticket-response.dto.js';
import {
  TicketChannel,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../entities/ticket.entity.js';

describe('ticket response contracts', () => {
  it('keeps SLA only in the support DTO and excludes it from the separate public DTO', () => {
    const ticket = {
      id: 'ticket-1',
      version: 1,
      tipo: TicketType.INC,
      consecutivo: 1,
      numero: 'INC0001',
      titulo: 'Acceso al sistema',
      descripcion: 'No se puede iniciar sesión.',
      categoriaId: 'category-1',
      prioridad: TicketPriority.MEDIA,
      canal: TicketChannel.CHAT,
      solicitanteNombre: 'Solicitante',
      solicitanteCorreo: 'solicitante@example.com',
      estado: TicketStatus.NUEVO,
      areaActualId: 'area-1',
      creadoPorId: 'agent-1',
      fechaCreacion: new Date('2026-01-01T08:00:00.000Z'),
      fechaUltimaActualizacion: new Date('2026-01-01T08:00:00.000Z'),
      tiempoPausaAcumuladoSeg: 0,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
      solucion: null,
      fechaCierre: null,
    };
    const sla = {
      limiteHoras: 24,
      consumidoHoras: 1,
      restanteHoras: 23,
      excedidoHoras: 0,
      porcentajeConsumido: 4.17,
      estado: 'DENTRO_DEL_PLAZO' as const,
      detenido: false,
    };

    const support = toSupportTicketResponse(ticket, sla);
    const publicResponse = toPublicTicketResponse(ticket);
    expect(support.sla).toEqual(sla);
    expect(support).not.toHaveProperty('version');
    expect(publicResponse).not.toHaveProperty('sla');
    expect(publicResponse).not.toHaveProperty('solicitanteCorreo');
  });
});
