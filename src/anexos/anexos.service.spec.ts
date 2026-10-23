import { ConfigService } from '@nestjs/config';
import { ClockService } from '../common/clock/clock.service.js';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { TicketStatus, TicketType } from '../tickets/entities/ticket.entity.js';
import { InMemoryAnexosRepository } from './repositories/in-memory-anexos.repository.js';
import { InMemoryFileStorage } from './storage/in-memory-file-storage.js';
import { AnexosService } from './anexos.service.js';

describe('AnexosService', () => {
  it('stores file bytes before waiting for the serialized ticket-action queue', async () => {
    const ticket = {
      id: 'ticket-io',
      estado: TicketStatus.NUEVO,
    };
    const unit = new TicketActionUnitOfWork();
    const repository = new InMemoryAnexosRepository(unit);
    const storage = new InMemoryFileStorage();
    const save = storage.guardar.bind(storage);
    let saved!: () => void;
    const fileSaved = new Promise<void>((resolve) => {
      saved = resolve;
    });
    vi.spyOn(storage, 'guardar').mockImplementation(async (contents) => {
      const key = await save(contents);
      saved();
      return key;
    });
    let startQueue!: () => void;
    let releaseQueue!: () => void;
    const queueStarted = new Promise<void>((resolve) => {
      startQueue = resolve;
    });
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const blockedAction = unit.execute(async () => {
      startQueue();
      await queueGate;
    });
    await queueStarted;
    const service = new AnexosService(
      repository,
      storage,
      { findById: vi.fn().mockResolvedValue(ticket) } as never,
      { findById: vi.fn().mockResolvedValue({ nombre: 'Agente' }) } as never,
      { canSee: vi.fn().mockResolvedValue(true) } as never,
      unit,
      { ahora: () => new Date('2026-01-01T00:00:00.000Z') } as ClockService,
      { get: () => 10_485_760 } as ConfigService,
    );
    const upload = service.upload(
      'ticket-io',
      [
        {
          originalname: 'evidencia.pdf',
          mimetype: 'application/pdf',
          size: Buffer.byteLength('%PDF-1.7'),
          buffer: Buffer.from('%PDF-1.7'),
        },
      ],
      { id: 'agent-1', rol: UserRole.AGENTE, areaId: 'area-1' },
    );

    await fileSaved;
    expect(await repository.listarPorTicket('ticket-io')).toHaveLength(0);
    releaseQueue();
    await blockedAction;
    await expect(upload).resolves.toHaveLength(1);
    expect(await repository.listarPorTicket('ticket-io')).toHaveLength(1);
  });

  it('removes files when metadata persistence fails', async () => {
    const ticket = {
      id: 'ticket-1',
      version: 1,
      tipo: TicketType.INC,
      numero: 'INC0001',
      consecutivo: 1,
      titulo: 'Error de acceso',
      descripcion: 'No se puede acceder a la cuenta.',
      categoriaId: 'category-1',
      prioridad: 'ALTA',
      canal: 'CHAT',
      solicitanteNombre: 'Solicitante',
      solicitanteCorreo: 'persona@example.com',
      estado: TicketStatus.NUEVO,
      areaActualId: 'area-1',
      creadoPorId: 'agent-1',
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
    const repository = {
      agregar: vi.fn().mockRejectedValue(new Error('falla de metadatos')),
      listarPorTicket: vi.fn().mockResolvedValue([]),
      buscarPorId: vi.fn().mockResolvedValue(null),
    };
    const storage = new InMemoryFileStorage();
    const save = storage.guardar.bind(storage);
    let storedKey = '';
    vi.spyOn(storage, 'guardar').mockImplementation(async (contents) => {
      storedKey = await save(contents);
      return storedKey;
    });
    const service = new AnexosService(
      repository,
      storage,
      { findById: vi.fn().mockResolvedValue(ticket) } as never,
      { findById: vi.fn().mockResolvedValue({ nombre: 'Agente' }) } as never,
      { canSee: vi.fn().mockResolvedValue(true) } as never,
      new TicketActionUnitOfWork(),
      { ahora: () => new Date('2026-01-01T00:00:00.000Z') } as ClockService,
      { get: () => 10_485_760 } as ConfigService,
    );

    await expect(
      service.upload(
        'ticket-1',
        [
          {
            originalname: 'evidencia.pdf',
            mimetype: 'application/pdf',
            size: Buffer.byteLength('%PDF-1.7'),
            buffer: Buffer.from('%PDF-1.7'),
          },
        ],
        { id: 'agent-1', rol: UserRole.AGENTE, areaId: 'area-1' },
      ),
    ).rejects.toThrow('falla de metadatos');
    expect(storedKey).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(storage.leer(storedKey)).rejects.toThrow('No se encontró el archivo almacenado.');
  });

  it('rolls back already committed metadata and removes every stored file after a mid-commit failure', async () => {
    const ticket = {
      id: 'ticket-2',
      version: 1,
      tipo: TicketType.INC,
      numero: 'INC0002',
      consecutivo: 2,
      titulo: 'Error de acceso',
      descripcion: 'No se puede acceder a la cuenta.',
      categoriaId: 'category-1',
      prioridad: 'ALTA',
      canal: 'CHAT',
      solicitanteNombre: 'Solicitante',
      solicitanteCorreo: 'persona@example.com',
      estado: TicketStatus.NUEVO,
      areaActualId: 'area-1',
      creadoPorId: 'agent-1',
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
    const unit = new TicketActionUnitOfWork();
    const repository = new InMemoryAnexosRepository(unit);
    const storage = new InMemoryFileStorage();
    const savedKeys: string[] = [];
    const save = storage.guardar.bind(storage);
    vi.spyOn(storage, 'guardar').mockImplementation(async (contents) => {
      const key = await save(contents);
      savedKeys.push(key);
      return key;
    });
    const originalStage = unit.stage.bind(unit);
    let stages = 0;
    vi.spyOn(unit, 'stage').mockImplementation((commit, rollback) => {
      stages += 1;
      if (stages === 3) {
        return originalStage(async () => {
          await commit();
          throw new Error('fallo en la segunda confirmación');
        }, rollback);
      }
      return originalStage(commit, rollback);
    });
    const service = new AnexosService(
      repository,
      storage,
      { findById: vi.fn().mockResolvedValue(ticket) } as never,
      { findById: vi.fn().mockResolvedValue({ nombre: 'Agente' }) } as never,
      { canSee: vi.fn().mockResolvedValue(true) } as never,
      unit,
      { ahora: () => new Date('2026-01-01T00:00:00.000Z') } as ClockService,
      { get: () => 10_485_760 } as ConfigService,
    );

    await expect(
      service.upload(
        'ticket-2',
        ['uno.pdf', 'dos.pdf'].map((originalname) => ({
          originalname,
          mimetype: 'application/pdf',
          size: Buffer.byteLength('%PDF-1.7'),
          buffer: Buffer.from('%PDF-1.7'),
        })),
        { id: 'agent-1', rol: UserRole.AGENTE, areaId: 'area-1' },
      ),
    ).rejects.toThrow('fallo en la segunda confirmación');

    expect(await repository.listarPorTicket('ticket-2')).toEqual([]);
    expect(savedKeys).toHaveLength(2);
    await Promise.all(
      savedKeys.map((key) =>
        expect(storage.leer(key)).rejects.toThrow('No se encontró el archivo almacenado.'),
      ),
    );
  });
});
