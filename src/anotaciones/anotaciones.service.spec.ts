import { ClockService } from '../common/clock/clock.service.js';
import { ConfigService } from '@nestjs/config';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { TicketStatus } from '../tickets/entities/ticket.entity.js';
import { AnotacionesService } from './anotaciones.service.js';

describe('AnotacionesService', () => {
  it('refuses new notes after the per-ticket limit without writing', async () => {
    const repository = {
      agregar: vi.fn(),
      listarPorTicket: vi.fn().mockResolvedValue(
        Array.from({ length: 200 }, (_, index) => ({
          id: `annotation-${index}`,
          ticketId: 'ticket-1',
          autorId: 'agent-1',
          texto: 'Nota',
          fecha: '2026-01-01T00:00:00.000Z',
        })),
      ),
    };
    const service = new AnotacionesService(
      repository,
      {
        findById: vi.fn().mockResolvedValue({ id: 'ticket-1', estado: TicketStatus.NUEVO }),
      } as never,
      { findById: vi.fn() } as never,
      { canSee: vi.fn().mockResolvedValue(true) } as never,
      { ahora: () => new Date('2026-01-01T00:00:00.000Z') } as ClockService,
      new TicketActionUnitOfWork(),
      { get: () => 200 } as ConfigService,
    );

    await expect(
      service.create('ticket-1', 'Nota adicional', {
        id: 'agent-1',
        rol: UserRole.AGENTE,
      }),
    ).rejects.toThrow('El ticket alcanzó el límite de 200 anotaciones.');
    expect(repository.agregar).not.toHaveBeenCalled();
  });
});
