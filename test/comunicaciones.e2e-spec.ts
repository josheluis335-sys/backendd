import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';
import { CATEGORIAS_REPOSITORY } from '../src/categorias/categorias.constants.js';
import type { CategoriasRepository } from '../src/categorias/interfaces/categorias.repository.interface.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { TicketActionUnitOfWork } from '../src/common/clock/ticket-action-unit-of-work.js';
import { ComunicacionesJob } from '../src/comunicaciones/comunicaciones.job.js';
import { COMUNICACIONES_REPOSITORY } from '../src/comunicaciones/comunicaciones.constants.js';
import { ComunicacionEstado } from '../src/comunicaciones/entities/comunicacion.entity.js';
import type { ComunicacionesRepository } from '../src/comunicaciones/interfaces/comunicaciones-repository.interface.js';
import { InMemoryMailboxReader } from '../src/comunicaciones/mailbox/in-memory-mailbox-reader.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import { TicketPriority, TicketType } from '../src/tickets/entities/ticket.entity.js';
import { TICKETS_REPOSITORY } from '../src/tickets/tickets.constants.js';
import type { TicketsRepository } from '../src/tickets/interfaces/tickets.repository.interface.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import { InMemoryMailer } from '../src/notificaciones/mailers/in-memory-mailer.js';

describe('Comunicaciones (e2e)', () => {
  let app: INestApplication<App>;
  let agentToken: string;
  let adminToken: string;
  let categoryId: string;
  let mailbox: InMemoryMailboxReader;
  let job: ComunicacionesJob;
  let mailer: InMemoryMailer;

  beforeAll(async () => {
    const fixedNow = new Date('2026-10-23T12:00:00.000Z');
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockService)
      .useValue({ ahora: () => new Date(fixedNow) })
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const users = app.get<UsuariosRepository>(USUARIOS_REPOSITORY);
    const sessions = app.get<SessionsRepository>(USUARIOS_SESSIONS_REPOSITORY);
    const jwt = app.get(JwtService);
    const area = (await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true))[0];
    categoryId = (await app.get<CategoriasRepository>(CATEGORIAS_REPOSITORY).findAll(true))[0].id;

    const makeToken = async (name: string, role: UserRole, email: string) => {
      const user = await users.create({
        nombre: name,
        correo: email,
        passwordHash: 'test-hash',
        rol: role,
        areaId: role === UserRole.AGENTE ? area.id : null,
        activo: true,
      });
      const sessionId = randomUUID();
      await sessions.create({
        id: sessionId,
        usuarioId: user.id,
        ultimaActividad: fixedNow,
      });
      return jwt.sign({
        sub: user.id,
        sid: sessionId,
        correo: user.correo,
        rol: user.rol,
        areaId: user.areaId,
      });
    };
    agentToken = await makeToken('Agente Comunicaciones', UserRole.AGENTE, 'agent-comm@example.com');
    adminToken = await makeToken('Admin Comunicaciones', UserRole.ADMINISTRADOR, 'admin-comm@example.com');
    mailbox = app.get(InMemoryMailboxReader);
    job = app.get(ComunicacionesJob);
    mailer = app.get(InMemoryMailer);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function email(messageId: string, overrides: Record<string, unknown> = {}) {
    mailbox.agregar({
      uid: randomUUID(),
      messageId,
      remitenteNombre: 'Solicitante Correo',
      remitenteCorreo: 'solicitante@example.com',
      asunto: 'Problema con el acceso',
      cuerpo: 'No puedo acceder al sistema de atención.',
      fechaRecepcion: new Date('2026-10-23T11:55:00.000Z'),
      headers: {},
      ...overrides,
    });
  }

  it('limits listing, detail, and conversion routes to AGENTE', async () => {
    await request(app.getHttpServer()).get('/api/comunicaciones').expect(401);
    await request(app.getHttpServer())
      .get('/api/comunicaciones')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/comunicaciones')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
  });

  it('polls and normalizes a message, exposes list/detail, and converts it once to a ticket', async () => {
    email('<phase10-convert@example.com>', {
      remitenteNombre: '  Solicitante\r\n  Correo ',
      asunto: '  Problema con el acceso\r\n',
      cuerpo: '  No puedo acceder al sistema de atención.\r\n',
    });
    await job.procesarBandeja();

    const listing = await request(app.getHttpServer())
      .get('/api/comunicaciones?estado=PENDIENTE')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(listing.body).toMatchObject({ total: 1, data: [expect.objectContaining({
      messageId: 'phase10-convert@example.com',
      remitenteNombre: 'Solicitante Correo',
      asunto: 'Problema con el acceso',
      estado: ComunicacionEstado.PENDIENTE,
    })] });
    expect(JSON.stringify(listing.body)).not.toMatch(/<html|<script|html original/i);
    expect(listing.body.data[0]).not.toHaveProperty('html');
    const communicationId = listing.body.data[0].id as string;
    const communicationRepository = app.get<ComunicacionesRepository>(COMUNICACIONES_REPOSITORY);
    const ticketRepository = app.get<TicketsRepository>(TICKETS_REPOSITORY);
    const actionUnit = app.get(TicketActionUnitOfWork);
    const send = mailer.enviar.bind(mailer);
    const notificationSpy = vi.spyOn(mailer, 'enviar').mockImplementation(async (message) => {
      expect(Reflect.get(actionUnit, 'staged')).toBeNull();
      expect(await communicationRepository.buscarPorId(communicationId)).toMatchObject({
        estado: ComunicacionEstado.CONVERTIDO,
      });
      expect(
        (await ticketRepository.findAll()).some(
          (ticket) => ticket.solicitanteCorreo === 'solicitante@example.com',
        ),
      ).toBe(true);
      return send(message);
    });

    await request(app.getHttpServer())
      .get(`/api/comunicaciones/${communicationId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const before = mailer.bandeja().length;
    const converted = await request(app.getHttpServer())
      .post(`/api/comunicaciones/${communicationId}/convertir`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        categoriaId: categoryId,
        tipo: TicketType.INC,
        prioridad: TicketPriority.ALTA,
      })
      .expect(201);

    expect(converted.body.comunicacion).toMatchObject({
      estado: ComunicacionEstado.CONVERTIDO,
      ticketId: converted.body.ticket.id,
    });
    expect(converted.body.ticket).toMatchObject({
      canal: 'CORREO',
      solicitanteCorreo: 'solicitante@example.com',
    });
    expect(converted.body.notificacion.estado).toBe('ENVIADA');
    expect(mailer.bandeja()).toHaveLength(before + 1);
    expect(mailer.bandeja().at(-1)?.para).toBe('solicitante@example.com');
    expect(notificationSpy).toHaveBeenCalledTimes(1);
    notificationSpy.mockRestore();
    await request(app.getHttpServer())
      .post(`/api/comunicaciones/${communicationId}/convertir`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        categoriaId: categoryId,
        tipo: TicketType.INC,
        prioridad: TicketPriority.ALTA,
      })
      .expect(409);
  });

  it('discards automatic messages and does not expose them as pending for conversion', async () => {
    email('<phase10-auto@example.com>', {
      headers: { 'Auto-Submitted': 'auto-replied' },
    });
    await job.procesarBandeja();
    const listing = await request(app.getHttpServer())
      .get('/api/comunicaciones?estado=DESCARTADO')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(listing.body.total).toBe(1);
    expect(listing.body.data[0]).toMatchObject({
      estado: ComunicacionEstado.DESCARTADO,
      motivoDescarte: 'CORREO_AUTOMATICO',
    });
    await request(app.getHttpServer())
      .post(`/api/comunicaciones/${listing.body.data[0].id}/convertir`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        categoriaId: categoryId,
        tipo: TicketType.INC,
        prioridad: TicketPriority.ALTA,
      })
      .expect(409);
  });

  it('allows exactly one of two concurrent conversions and sends one notification', async () => {
    email('<phase10-concurrent@example.com>');
    await job.procesarBandeja();
    const listing = await request(app.getHttpServer())
      .get('/api/comunicaciones?estado=PENDIENTE')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const id = listing.body.data[0].id as string;
    const tickets = app.get<TicketsRepository>(TICKETS_REPOSITORY);
    const initialTicketCount = (await tickets.findAll()).length;
    const requestConversion = () =>
      request(app.getHttpServer())
        .post(`/api/comunicaciones/${id}/convertir`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          categoriaId: categoryId,
          tipo: TicketType.REQ,
          prioridad: TicketPriority.MEDIA,
        });
    const before = mailer.bandeja().length;
    const results = await Promise.all([requestConversion(), requestConversion()]);
    expect(results.map((result) => result.status).sort((left, right) => left - right)).toEqual([
      201,
      409,
    ]);
    expect((await tickets.findAll()).length).toBe(initialTicketCount + 1);
    expect(mailer.bandeja()).toHaveLength(before + 1);
  });

  it('rejects fields outside the conversion DTO and keeps a message pending for an inactive category', async () => {
    email('<phase10-inactive-category@example.com>');
    await job.procesarBandeja();
    const listing = await request(app.getHttpServer())
      .get('/api/comunicaciones?estado=PENDIENTE')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const pending = listing.body.data.find(
      (item: { messageId: string }) => item.messageId === 'phase10-inactive-category@example.com',
    );
    const inactive = await app.get<CategoriasRepository>(CATEGORIAS_REPOSITORY).create({
      nombre: 'Categoría inactiva de correo',
      activa: false,
      areaSugeridaId: null,
    });

    await request(app.getHttpServer())
      .post(`/api/comunicaciones/${pending.id}/convertir`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        categoriaId: categoryId,
        tipo: TicketType.INC,
        prioridad: TicketPriority.ALTA,
        ticketId: 'forbidden',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/comunicaciones/${pending.id}/convertir`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        categoriaId: inactive.id,
        tipo: TicketType.INC,
        prioridad: TicketPriority.ALTA,
      })
      .expect(409);

    const stillPending = await request(app.getHttpServer())
      .get(`/api/comunicaciones/${pending.id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(stillPending.body.estado).toBe(ComunicacionEstado.PENDIENTE);
  });

  it('does not expose communication edit or delete endpoints', async () => {
    await request(app.getHttpServer())
      .patch('/api/comunicaciones/message-id')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/comunicaciones/message-id')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(404);
  });
});
