import express from 'express';
import { INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import { TICKETS_REPOSITORY } from '../src/tickets/tickets.constants.js';
import type { TicketsRepository } from '../src/tickets/interfaces/tickets.repository.interface.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';
import { CATEGORIAS_REPOSITORY } from '../src/categorias/categorias.constants.js';
import type { CategoriasRepository } from '../src/categorias/interfaces/categorias.repository.interface.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import {
  Ticket,
  TicketChannel,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../src/tickets/entities/ticket.entity.js';
import { createPublicCorsMiddleware } from '../src/publico/public-cors.js';

describe('Public ticket lookup (e2e)', () => {
  let app: INestApplication<App>;
  let tickets: TicketsRepository;
  let now = new Date('2026-10-23T12:00:00.000Z');
  let sequence = 1;

  const createTicket = async (
    estado: TicketStatus = TicketStatus.NUEVO,
    overrides: Partial<Ticket> = {},
  ): Promise<Ticket> => {
    const number = `INC${String(sequence++).padStart(4, '0')}`;
    const ticket: Ticket = {
      id: randomUUID(),
      version: 9,
      tipo: TicketType.INC,
      consecutivo: sequence,
      numero: number,
      titulo: 'Título confidencial',
      descripcion: 'Descripción confidencial',
      categoriaId: 'private-category',
      prioridad: TicketPriority.CRITICA,
      canal: TicketChannel.CHAT,
      solicitanteNombre: 'Nombre confidencial',
      solicitanteCorreo: 'person@example.com',
      estado,
      areaActualId: 'private-area',
      creadoPorId: 'private-user',
      fechaCreacion: new Date(now),
      fechaUltimaActualizacion: new Date(now),
      tiempoPausaAcumuladoSeg: 0,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
      solucion: 'Solución confidencial',
      fechaCierre: null,
      ...overrides,
    };
    await tickets.create(ticket);
    return ticket;
  };

  beforeEach(async () => {
    now = new Date('2026-10-23T12:00:00.000Z');
    sequence = 1;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClockService)
      .useValue({ ahora: () => new Date(now) })
      .compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    app.getHttpAdapter().getInstance().set('trust proxy', false);
    app.use('/api/publico', createPublicCorsMiddleware(['http://localhost:5173']));
    app.use('/api/publico', express.json({ limit: '1kb' }));
    app.use(express.json({ limit: '1mb' }));
    await app.init();
    tickets = app.get<TicketsRepository>(TICKETS_REPOSITORY);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns exactly the public allow-list for tickets in every support state', async () => {
    for (const estado of Object.values(TicketStatus)) {
      const ticket = await createTicket(estado);
      const response = await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
        .expect(200);
      expect(Object.keys(response.body).sort()).toEqual([
        'estado',
        'fechaUltimaActualizacion',
        'numero',
        'tipo',
      ]);
      expect(response.body).toEqual({
        numero: ticket.numero,
        tipo: ticket.tipo,
        estado,
        fechaUltimaActualizacion: ticket.fechaUltimaActualizacion.toISOString(),
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-robots-tag']).toBe('noindex');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('returns identical generic responses for unknown case, wrong email, invalid format, and empty body', async () => {
    const ticket = await createTicket();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: 'INC9999', correo: 'person@example.com' }),
      request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: ticket.numero, correo: 'wrong@example.com' }),
      request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: 'bad', correo: 'person@example.com' }),
      request(app.getHttpServer()).post('/api/publico/consulta').send({}),
    ]);
    for (const response of responses) expect(response.status).toBe(404);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(responses[1].body).toEqual(responses[2].body);
    expect(responses[2].body).toEqual(responses[3].body);
    expect(responses[0].body.message).toBe(
      'No encontramos un ticket con esos datos. Verifica el número de caso y tu correo.',
    );
  });

  it('blocks after five consecutive failures, including correct data during the lock', async () => {
    const ticket = await createTicket();
    const lookup = () =>
      request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: ticket.numero, correo: 'wrong@example.com' });
    for (let index = 0; index < 5; index++) await lookup().expect(404);
    const blocked = await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.message).toContain('Demasiadas consultas');
  });

  it('releases the block when the configured ClockService window expires', async () => {
    const ticket = await createTicket();
    for (let index = 0; index < 5; index++) {
      await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: ticket.numero, correo: 'wrong@example.com' })
        .expect(404);
    }
    now = new Date(now.getTime() + 5 * 60 * 1000);
    await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
      .expect(200);
  });

  it('blocks the IP after 25 failures despite a successful lookup of its own ticket', async () => {
    const ownedTicket = await createTicket();
    const otherTicket = await createTicket();
    for (let index = 1; index <= 4; index++) {
      await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({
          numeroCaso: `REQ${String(index).padStart(4, '0')}`,
          correo: 'wrong@example.com',
        })
        .expect(404);
    }
    await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .send({ numeroCaso: ownedTicket.numero, correo: ownedTicket.solicitanteCorreo })
      .expect(200);
    for (let index = 5; index <= 25; index++) {
      await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({
          numeroCaso: `REQ${String(index).padStart(4, '0')}`,
          correo: 'wrong@example.com',
        })
        .expect(404);
    }
    await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .send({ numeroCaso: otherTicket.numero, correo: 'wrong@example.com' })
      .expect(429);
  });

  it('atomically blocks after the exact threshold under 20 concurrent failures', async () => {
    const ticket = await createTicket();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .post('/api/publico/consulta')
          .send({ numeroCaso: ticket.numero, correo: 'wrong@example.com' }),
      ),
    );
    expect(responses.filter(({ status }) => status === 404)).toHaveLength(5);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(15);
    await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
      .expect(429);
  });

  it('applies the independent throttler limit of 30 requests per minute per IP', async () => {
    const ticket = await createTicket();
    const lookup = () =>
      request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo });
    for (let index = 0; index < 30; index++) await lookup().expect(200);
    await lookup().expect(429);
  });

  it('ignores X-Forwarded-For when TRUST_PROXY is false', async () => {
    const ticket = await createTicket();
    for (let index = 0; index < 5; index++) {
      await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .set('X-Forwarded-For', `198.51.100.${index + 1}`)
        .send({ numeroCaso: ticket.numero, correo: 'wrong@example.com' })
        .expect(404);
    }
    await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .set('X-Forwarded-For', '203.0.113.77')
      .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
      .expect(429);
  });

  it('isolates portal CORS from support routes and ignores a support JWT', async () => {
    const ticket = await createTicket();
    const supportToken = app.get(JwtService).sign({
      sub: 'support-user',
      sid: 'support-session',
      correo: 'agent@example.com',
      rol: UserRole.AGENTE,
    });
    const allowed = await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .set('Origin', 'http://localhost:5173')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('false');

    const denied = await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .set('Origin', 'https://untrusted.example')
      .send({ numeroCaso: ticket.numero, correo: ticket.solicitanteCorreo })
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();

    const support = await request(app.getHttpServer())
      .get('/api/areas')
      .set('Origin', 'http://localhost:5173')
      .expect(401);
    expect(support.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not log the submitted email on blocked attempts', async () => {
    const ticket = await createTicket();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      for (let index = 0; index < 5; index++) {
        await request(app.getHttpServer())
          .post('/api/publico/consulta')
          .send({ numeroCaso: ticket.numero, correo: 'secret.person@example.com' })
          .expect(404);
      }
      await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: ticket.numero, correo: 'secret.person@example.com' })
        .expect(429);
      const logs = warn.mock.calls.flat().join(' ');
      expect(logs).not.toContain('secret.person@example.com');
      expect(logs).not.toContain(ticket.numero);
    } finally {
      warn.mockRestore();
    }
  });

  it('reflects support escalation, pause, resume, and close changes in public status', async () => {
    const activeAreas = await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true);
    const activeCategories = await app
      .get<CategoriasRepository>(CATEGORIAS_REPOSITORY)
      .findAll(true);
    const areaId = activeAreas[0].id;
    const categoryId = activeCategories[0].id;
    const user = await app.get<UsuariosRepository>(USUARIOS_REPOSITORY).create({
      nombre: 'Portal Support Agent',
      correo: 'portal-agent@example.com',
      passwordHash: 'test-hash',
      rol: UserRole.AGENTE,
      areaId,
      activo: true,
    });
    const sessionId = randomUUID();
    await app.get<SessionsRepository>(USUARIOS_SESSIONS_REPOSITORY).create({
      id: sessionId,
      usuarioId: user.id,
      ultimaActividad: new Date(now),
    });
    const token = app.get(JwtService).sign({
      sub: user.id,
      sid: sessionId,
      correo: user.correo,
      rol: user.rol,
      areaId,
    });
    const authorization = `Bearer ${token}`;
    const created = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', authorization)
      .send({
        tipo: TicketType.INC,
        titulo: 'Acceso al sistema',
        descripcion: 'No es posible acceder al sistema.',
        categoriaId: categoryId,
        prioridad: TicketPriority.MEDIA,
        canal: TicketChannel.CHAT,
        solicitanteNombre: 'Solicitante Portal',
        solicitanteCorreo: 'person@example.com',
      })
      .expect(201);
    const ticketId = created.body.id as string;
    const number = created.body.numero as string;
    const consultState = async (estado: TicketStatus) => {
      const response = await request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: number, correo: 'person@example.com' })
        .expect(200);
      expect(response.body.estado).toBe(estado);
    };

    await consultState(TicketStatus.NUEVO);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/escalar`)
      .set('Authorization', authorization)
      .send({
        areaId,
        recibidoPorId: user.id,
        comentario: 'Se escala para su seguimiento.',
      })
      .expect(201);
    await consultState(TicketStatus.ESCALADO);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/pausar`)
      .set('Authorization', authorization)
      .send({ motivo: 'Esperar confirmación del solicitante.' })
      .expect(201);
    await consultState(TicketStatus.EN_PAUSA);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/reanudar`)
      .set('Authorization', authorization)
      .expect(201);
    await consultState(TicketStatus.ESCALADO);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/cerrar`)
      .set('Authorization', authorization)
      .send({ solucion: 'Se restableció el acceso del solicitante.' })
      .expect(201);
    await consultState(TicketStatus.CERRADO);
  });

  it('rejects body payloads above 1 KB with the same generic response', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .send({ numeroCaso: 'INC0001', correo: 'x'.repeat(2000) })
      .expect(404);
    expect(response.body.message).toBe(
      'No encontramos un ticket con esos datos. Verifica el número de caso y tu correo.',
    );
  });

  it('does not expose routes for editing or deleting communications data', async () => {
    await request(app.getHttpServer()).get('/api/publico/consulta').expect(404);
    await request(app.getHttpServer()).patch('/api/publico/consulta').expect(404);
    await request(app.getHttpServer()).delete('/api/publico/consulta').expect(404);
  });
});
