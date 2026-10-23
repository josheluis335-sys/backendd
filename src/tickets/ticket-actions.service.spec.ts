import { AreasService } from '../areas/areas.service.js';
import { InMemoryAreasRepository } from '../areas/repositories/in-memory-areas.repository.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { InMemoryBitacoraRepository } from '../bitacora/repositories/in-memory-bitacora.repository.js';
import { ClockService } from '../common/clock/clock.service.js';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { SlaService } from '../sla/sla.service.js';
import { createSlaConfig } from '../sla/sla.config.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { CategoriasService } from '../categorias/categorias.service.js';
import { InMemoryCategoriasRepository } from '../categorias/repositories/in-memory-categorias.repository.js';
import { EscalamientosService } from '../escalamientos/escalamientos.service.js';
import { InMemoryEscalamientosRepository } from '../escalamientos/repositories/in-memory-escalamientos.repository.js';
import { InMemoryUsuariosRepository } from '../usuarios/repositories/in-memory-usuarios.repository.js';
import { TicketChannel, TicketPriority, TicketType } from './entities/ticket.entity.js';
import { TicketStatus } from './entities/ticket.entity.js';
import { EventoBitacoraTipo } from '../bitacora/entities/evento-bitacora.entity.js';
import { TicketVersionConflictError } from './interfaces/tickets.repository.interface.js';
import { TicketCounterService } from './counter/ticket-counter.service.js';
import { TicketVisibilityPolicy } from './policy/ticket-visibility.policy.js';
import { InMemoryTicketsRepository } from './repositories/in-memory-tickets.repository.js';
import { TicketsService } from './tickets.service.js';

async function createFixture() {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const clock = { ahora: () => new Date(now) } as ClockService;
  const sla = new SlaService(
    createSlaConfig({ SLA_TIMEZONE: 'UTC' }),
    clock,
  );
  const unit = new TicketActionUnitOfWork();
  const areasRepository = new InMemoryAreasRepository();
  const categoriesRepository = new InMemoryCategoriasRepository();
  const usersRepository = new InMemoryUsuariosRepository(clock);
  const areas = new AreasService(areasRepository, categoriesRepository, usersRepository);
  await areas.seedInitialAreas();
  const categories = new CategoriasService(categoriesRepository, areas);
  await categories.seedInitialAreasAndCategories();
  const ticketsRepository = new InMemoryTicketsRepository(unit);
  const bitacoraRepository = new InMemoryBitacoraRepository(unit);
  const escalamientosRepository = new InMemoryEscalamientosRepository(unit);
  const escalamientos = new EscalamientosService(
    escalamientosRepository,
    areas,
    usersRepository,
    clock,
  );
  const visibility = new TicketVisibilityPolicy(escalamientos);
  const bitacora = new BitacoraService(
    bitacoraRepository,
    ticketsRepository,
    usersRepository,
    visibility,
    clock,
  );
  const tickets = new TicketsService(
    ticketsRepository,
    new TicketCounterService(),
    categories,
    areas,
    bitacora,
    visibility,
    clock,
    escalamientos,
    unit,
    sla,
    { notificar: vi.fn().mockResolvedValue({ estado: 'ENVIADA' }) } as never,
  );
  const allAreas = await areas.findAll(true);
  const category = (await categories.findAll(true))[0];
  const actor = {
    id: 'ticket-action-agent',
    rol: UserRole.AGENTE,
    areaId: allAreas[0].id,
  };
  const createTicket = () =>
    tickets.create(
      {
        tipo: TicketType.INC,
        titulo: 'Error de acceso',
        descripcion: 'El usuario no puede ingresar al sistema.',
        categoriaId: category.id,
        prioridad: TicketPriority.MEDIA,
        canal: TicketChannel.CHAT,
        solicitanteNombre: 'Solicitante',
        solicitanteCorreo: 'solicitante@example.com',
      },
      actor,
    );

  return {
    actor,
    areas: allAreas,
    bitacoraRepository,
    bitacora,
    clock,
    sla,
    unit,
    createTicket,
    escalamientos,
    now: (value: string) => {
      now = new Date(value);
    },
    tickets,
    ticketsRepository,
    usersRepository,
  };
}

describe('ticket action service', () => {
  it('sums separate pauses and restores NUEVO as the previous state', async () => {
    const fixture = await createFixture();
    const ticket = await fixture.createTicket();

    await fixture.tickets.pause(ticket.id, { motivo: 'Primera pausa' }, fixture.actor);
    fixture.now('2026-01-01T00:00:20.000Z');
    const firstResume = await fixture.tickets.resume(ticket.id, fixture.actor);
    expect(firstResume.estado).toBe('NUEVO');
    expect(firstResume.tiempoPausaAcumuladoSeg).toBe(20);

    await fixture.tickets.pause(ticket.id, { motivo: 'Segunda pausa' }, fixture.actor);
    fixture.now('2026-01-01T00:00:55.000Z');
    const secondResume = await fixture.tickets.resume(ticket.id, fixture.actor);
    expect(secondResume.estado).toBe('NUEVO');
    expect(secondResume.tiempoPausaAcumuladoSeg).toBe(55);
  });

  it('restores ESCALADO after a pause', async () => {
    const fixture = await createFixture();
    const ticket = await fixture.createTicket();
    await fixture.tickets.escalate(
      ticket.id,
      { areaId: fixture.areas[1].id, comentario: 'Enviar a soporte' },
      fixture.actor,
    );

    await fixture.tickets.pause(ticket.id, { motivo: 'Esperando respuesta' }, fixture.actor);
    fixture.now('2026-01-01T00:00:45.000Z');
    const resumed = await fixture.tickets.resume(ticket.id, fixture.actor);

    expect(resumed.estado).toBe('ESCALADO');
    expect(resumed.tiempoPausaAcumuladoSeg).toBe(45);
  });

  it('allows reassignment within the same area when a receiver is supplied', async () => {
    const fixture = await createFixture();
    const ticket = await fixture.createTicket();
    const receiver = await fixture.usersRepository.create({
      nombre: 'Agente receptor',
      correo: 'receptor@example.com',
      passwordHash: 'test-hash',
      rol: UserRole.AGENTE,
      areaId: fixture.actor.areaId!,
      activo: true,
    });

    const updated = await fixture.tickets.escalate(
      ticket.id,
      {
        areaId: fixture.actor.areaId!,
        recibidoPorId: receiver.id,
        comentario: 'Reasignar dentro del área',
      },
      fixture.actor,
    );

    expect(updated.estado).toBe('ESCALADO');
    expect(await fixture.escalamientos.ultimoPorTicket(ticket.id)).toMatchObject({
      areaId: fixture.actor.areaId,
      recibidoPorId: receiver.id,
    });
  });

  it.each([
    ['inactivo', { activo: false, rol: UserRole.AGENTE, areaOffset: 1 }],
    ['de otra área', { activo: true, rol: UserRole.AGENTE, areaOffset: 0 }],
    ['administrador', { activo: true, rol: UserRole.ADMINISTRADOR, areaOffset: 1 }],
  ])('rejects a receiver %s', async (_description, receiverOptions) => {
    const fixture = await createFixture();
    const destination = fixture.areas[1];
    const receiver = await fixture.usersRepository.create({
      nombre: 'Usuario receptor',
      correo: `receptor-${_description}@example.com`,
      passwordHash: 'test-hash',
      rol: receiverOptions.rol,
      areaId: fixture.areas[receiverOptions.areaOffset].id,
      activo: receiverOptions.activo,
    });

    await expect(
      fixture.escalamientos.validarDestino(destination.id, receiver.id),
    ).rejects.toThrow('El usuario receptor debe estar activo');
  });

  it('does not change a ticket or append an escalation when bitácora persistence fails', async () => {
    const fixture = await createFixture();
    const ticket = await fixture.createTicket();
    vi.spyOn(fixture.bitacoraRepository, 'agregar').mockRejectedValueOnce(
      new Error('fallo de persistencia simulado'),
    );

    await expect(
      fixture.tickets.escalate(
        ticket.id,
        { areaId: fixture.areas[1].id, comentario: 'Enviar a soporte' },
        fixture.actor,
      ),
    ).rejects.toThrow('fallo de persistencia simulado');

    expect(await fixture.ticketsRepository.findById(ticket.id)).toMatchObject({
      estado: 'NUEVO',
      version: 1,
      areaActualId: fixture.actor.areaId,
    });
    expect(await fixture.escalamientos.ultimoPorTicket(ticket.id)).toBeNull();
    expect(await fixture.bitacoraRepository.listarPorTicket(ticket.id)).toHaveLength(1);
  });

  it('discards staged audit and escalation entries when optimistic version validation fails at commit', async () => {
    const fixture = await createFixture();
    const ticket = await fixture.createTicket();

    await expect(
      fixture.unit.execute(async () => {
        await fixture.bitacora.registrar(
          ticket.id,
          EventoBitacoraTipo.ESCALAMIENTO,
          { areaId: fixture.areas[1].id },
          fixture.actor.id,
        );
        await fixture.escalamientos.registrar(
          ticket.id,
          fixture.areas[1].id,
          fixture.actor.id,
          'Enviar a soporte',
        );
        await fixture.ticketsRepository.actualizar(
          { ...ticket, estado: TicketStatus.ESCALADO },
          ticket.version,
        );
        await fixture.ticketsRepository.actualizar(
          { ...ticket, estado: TicketStatus.CERRADO },
          ticket.version,
        );
      }),
    ).rejects.toBeInstanceOf(TicketVersionConflictError);

    expect(await fixture.ticketsRepository.findById(ticket.id)).toMatchObject({
      estado: 'NUEVO',
      version: 1,
    });
    expect(await fixture.escalamientos.ultimoPorTicket(ticket.id)).toBeNull();
    expect(await fixture.bitacoraRepository.listarPorTicket(ticket.id)).toHaveLength(1);
  });

  it('rolls back earlier commits if a later in-memory commit fails', async () => {
    const fixture = await createFixture();
    const ticket = await fixture.createTicket();
    const originalStage = fixture.unit.stage.bind(fixture.unit);
    const stage = vi.spyOn(fixture.unit, 'stage');
    let actionStages = 0;
    stage.mockImplementation(async (commit, rollback) => {
      actionStages += 1;
      if (actionStages === 3) {
        await originalStage(
          () => {
            throw new Error('fallo durante confirmación');
          },
          rollback,
        );
      } else {
        await originalStage(commit, rollback);
      }
    });

    await expect(
      fixture.tickets.escalate(
        ticket.id,
        { areaId: fixture.areas[1].id, comentario: 'Enviar a soporte' },
        fixture.actor,
      ),
    ).rejects.toThrow('fallo durante confirmación');

    expect(await fixture.ticketsRepository.findById(ticket.id)).toMatchObject({
      estado: 'NUEVO',
      version: 1,
    });
    expect(await fixture.escalamientos.ultimoPorTicket(ticket.id)).toBeNull();
    expect(await fixture.bitacoraRepository.listarPorTicket(ticket.id)).toHaveLength(1);
    stage.mockRestore();
  });
});
