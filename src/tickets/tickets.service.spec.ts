import { AreasService } from '../areas/areas.service.js';
import { InMemoryAreasRepository } from '../areas/repositories/in-memory-areas.repository.js';
import { InMemoryCategoriasRepository } from '../categorias/repositories/in-memory-categorias.repository.js';
import { CategoriasService } from '../categorias/categorias.service.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { InMemoryUsuariosRepository } from '../usuarios/repositories/in-memory-usuarios.repository.js';
import { TicketChannel, TicketPriority, TicketType } from './entities/ticket.entity.js';
import { TicketCounterService } from './counter/ticket-counter.service.js';
import { InMemoryTicketsRepository } from './repositories/in-memory-tickets.repository.js';
import { TicketVisibilityPolicy } from './policy/ticket-visibility.policy.js';
import { TicketsService } from './tickets.service.js';
import { ClockService } from '../common/clock/clock.service.js';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { SlaService } from '../sla/sla.service.js';
import { createSlaConfig } from '../sla/sla.config.js';

describe('TicketsService numbering', () => {
  it('allocates 50 unique consecutive INC numbers across simultaneous ticket creations', async () => {
    const areaRepository = new InMemoryAreasRepository();
    const categoriesRepository = new InMemoryCategoriasRepository();
    const usersRepository = new InMemoryUsuariosRepository();
    const areas = new AreasService(areaRepository, categoriesRepository, usersRepository);
    await areas.seedInitialAreas();
    const categories = new CategoriasService(categoriesRepository, areas);
    await categories.seedInitialAreasAndCategories();
    const area = (await areas.findAll(true))[0];
    const category = (await categories.findAll(true))[0];
    const unit = new TicketActionUnitOfWork();
    const service = new TicketsService(
      new InMemoryTicketsRepository(unit),
      new TicketCounterService(),
      categories,
      areas,
      { registrar: vi.fn().mockResolvedValue(undefined) } as never,
      new TicketVisibilityPolicy({ ultimoPorTicket: vi.fn() } as never),
      new ClockService(),
      { registrar: vi.fn(), validarDestino: vi.fn(), ultimoPorTicket: vi.fn() } as never,
      unit,
      new SlaService(createSlaConfig({ SLA_TIMEZONE: 'UTC' }), new ClockService()),
      { notificar: vi.fn().mockResolvedValue({ estado: 'ENVIADA' }) } as never,
    );
    const dto = {
      tipo: TicketType.INC,
      titulo: 'Error de acceso simultáneo',
      descripcion: 'El usuario no puede iniciar sesión en el sistema.',
      categoriaId: category.id,
      prioridad: TicketPriority.MEDIA,
      canal: TicketChannel.CHAT,
      solicitanteNombre: 'Solicitante',
      solicitanteCorreo: 'solicitante@example.com',
    };
    const actor = {
      id: 'agent-concurrent',
      rol: UserRole.AGENTE,
      areaId: area.id,
    };

    await expect(
      service.create({ ...dto, categoriaId: 'categoría-inexistente' }, actor),
    ).rejects.toThrow();

    const created = await Promise.all(
      Array.from({ length: 50 }, () => service.create(dto, actor)),
    );

    expect(new Set(created.map(({ numero }) => numero)).size).toBe(50);
    expect(created.map(({ consecutivo }) => consecutivo).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
  });
});
