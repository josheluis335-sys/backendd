import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';
import { AppModule } from '../src/app.module.js';
import { CATEGORIAS_REPOSITORY } from '../src/categorias/categorias.constants.js';
import type { CategoriasRepository } from '../src/categorias/interfaces/categorias.repository.interface.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import { TicketChannel, TicketPriority, TicketType } from '../src/tickets/entities/ticket.entity.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import { TICKETS_REPOSITORY } from '../src/tickets/tickets.constants.js';
import type { TicketsRepository } from '../src/tickets/interfaces/tickets.repository.interface.js';
import { InMemoryMailer } from '../src/notificaciones/mailers/in-memory-mailer.js';

describe('Tickets and audit log (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let agentOneToken: string;
  let agentTwoToken: string;
  let supervisorOneToken: string;
  let supervisorTwoToken: string;
  let areaOneId: string;
  let areaTwoId: string;
  let agentOneId: string;
  let categoryId: string;
  let clockNow = new Date('2026-10-23T12:00:00.000Z');

  const ticketBody = (tipo: TicketType, overrides: Record<string, unknown> = {}) => ({
    tipo,
    titulo: 'Error de acceso al sistema',
    descripcion: 'El solicitante no puede ingresar a su cuenta.',
    categoriaId: categoryId,
    prioridad: TicketPriority.ALTA,
    canal: TicketChannel.CHAT,
    solicitanteNombre: '  Persona Solicitante  ',
    solicitanteCorreo: '  PERSONA@Example.com  ',
    ...overrides,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClockService)
      .useValue({ ahora: () => new Date(clockNow) })
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
    const activeAreas = await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true);
    areaOneId = activeAreas[0].id;
    areaTwoId = activeAreas[1].id;
    categoryId = (await app.get<CategoriasRepository>(CATEGORIAS_REPOSITORY).findAll(true))[0].id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);
    adminToken = adminLogin.body.access_token as string;

    const makeActor = async (name: string, role: UserRole, areaId: string) => {
      const user = await users.create({
        nombre: name,
        correo: `${name.toLowerCase().replaceAll(' ', '.')}@tickets.example.com`,
        passwordHash: 'test-hash',
        rol: role as UserRole.AGENTE | UserRole.SUPERVISOR,
        areaId,
        activo: true,
      });
      const sessionId = randomUUID();
      await sessions.create({
        id: sessionId,
        usuarioId: user.id,
        ultimaActividad: new Date(clockNow),
      });
      return {
        id: user.id,
        token: jwt.sign({
          sub: user.id,
          sid: sessionId,
          correo: user.correo,
          rol: user.rol,
          areaId: user.areaId,
        }),
      };
    };

    const agentOne = await makeActor('Agente Uno', UserRole.AGENTE, areaOneId);
    const agentTwo = await makeActor('Agente Dos', UserRole.AGENTE, areaTwoId);
    const supervisorOne = await makeActor('Supervisor Uno', UserRole.SUPERVISOR, areaOneId);
    const supervisorTwo = await makeActor('Supervisor Dos', UserRole.SUPERVISOR, areaTwoId);
    agentOneId = agentOne.id;
    agentOneToken = agentOne.token;
    agentTwoToken = agentTwo.token;
    supervisorOneToken = supervisorOne.token;
    supervisorTwoToken = supervisorTwo.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function createTicket(
    token: string,
    tipo: TicketType = TicketType.INC,
    overrides: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send(ticketBody(tipo, overrides));
  }

  it('creates INC and REQ with independent sequences and records the immutable creation event', async () => {
    const incident = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const requestTicket = await createTicket(agentOneToken, TicketType.REQ).expect(201);
    const secondIncident = await createTicket(agentOneToken, TicketType.INC).expect(201);

    expect(incident.body.numero).toBe('INC0001');
    expect(requestTicket.body.numero).toBe('REQ0001');
    expect(secondIncident.body.numero).toBe('INC0002');
    expect(incident.body.estado).toBe('NUEVO');
    expect(incident.body.areaActualId).toBe(areaOneId);
    expect(incident.body.creadoPorId).toBe(agentOneId);
    expect(incident.body.solicitanteCorreo).toBe('persona@example.com');
    expect(incident.body.solicitanteNombre).toBe('Persona Solicitante');
    expect(incident.body).toMatchObject({
      tiempoPausaAcumuladoSeg: 0,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
      solucion: null,
      fechaCierre: null,
    });
    expect(incident.body).not.toHaveProperty('version');

    const log = await request(app.getHttpServer())
      .get(`/api/tickets/${incident.body.id}/bitacora`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(log.body.total).toBe(2);
    expect(log.body.data[0]).toMatchObject({
      evento: {
        ticketId: incident.body.id,
        tipo: 'CREACION',
        usuarioId: agentOneId,
        detalle: { numero: 'INC0001' },
      },
      usuarioNombre: 'Agente Uno',
    });
    expect(new Date(log.body.data[0].fecha + 'T' + log.body.data[0].hora + 'Z').toString()).not.toBe(
      'Invalid Date',
    );

    const adminLog = await request(app.getHttpServer())
      .get(`/api/tickets/${incident.body.id}/bitacora?page=1&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminLog.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });

    const detail = await request(app.getHttpServer())
      .get(`/api/tickets/${incident.body.id}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(detail.body.sla).toMatchObject({
      limiteHoras: 8,
      estado: 'DENTRO_DEL_PLAZO',
      detenido: false,
    });
  });

  it('sends one safe notification for create, escalate, and close, but none for pause or resume', async () => {
      const mailer = app.get(InMemoryMailer);
      const start = mailer.bandeja().length;
      const created = await createTicket(agentOneToken).expect(201);
      expect(created.body.notificacion.estado).toBe('ENVIADA');
      const creationMessage = mailer.bandeja()[start];
      expect(creationMessage.asunto).toBe(`[Mesa de Servicio] Ticket ${created.body.numero} creado`);
      expect(creationMessage.para).toBe('persona@example.com');
      expect(creationMessage.headers).toMatchObject({
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
      });
      expect(`${creationMessage.texto}\n${creationMessage.html}`).not.toMatch(
        /SLA|Error de acceso al sistema|solución|Área|Agente/i,
      );

      await request(app.getHttpServer())
        .post(`/api/tickets/${created.body.id}/escalar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({
          areaId: areaOneId,
          recibidoPorId: agentOneId,
          comentario: 'Reasignar dentro del área responsable.',
        })
        .expect(201)
        .expect(({ body }) => expect(body.notificacion.estado).toBe('ENVIADA'));
      expect(mailer.bandeja()).toHaveLength(start + 2);

      await request(app.getHttpServer())
        .post(`/api/tickets/${created.body.id}/cerrar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ solucion: 'Solución interna no debe notificarse.' })
        .expect(201)
        .expect(({ body }) => expect(body.notificacion.estado).toBe('ENVIADA'));
      expect(mailer.bandeja()).toHaveLength(start + 3);
      const log = await request(app.getHttpServer())
        .get(`/api/tickets/${created.body.id}/bitacora`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .expect(200);
      expect(log.body.data.map((entry: { evento: { tipo: string } }) => entry.evento.tipo))
        .toContain('NOTIFICACION_ENVIADA');

      const paused = await createTicket(agentOneToken).expect(201);
      const afterCreation = mailer.bandeja().length;
      await request(app.getHttpServer())
        .post(`/api/tickets/${paused.body.id}/pausar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ motivo: 'Esperar confirmación.' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/tickets/${paused.body.id}/reanudar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .expect(201);
      expect(mailer.bandeja()).toHaveLength(afterCreation);
    });

  it('keeps ticket actions successful on mail failure and records a safe failure event', async () => {
      const mailer = app.get(InMemoryMailer);
      const created = await createTicket(agentOneToken).expect(201);
      mailer.fallarSiguiente(new Error('SMTP secret must never leak'));
      const response = await request(app.getHttpServer())
        .post(`/api/tickets/${created.body.id}/cerrar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ solucion: 'Solución confirmada.' })
        .expect(201);
      expect(response.body.estado).toBe('CERRADO');
      expect(response.body.notificacion).toMatchObject({
        estado: 'FALLIDA',
        aviso: expect.stringContaining('No se pudo enviar'),
      });
      const log = await request(app.getHttpServer())
        .get(`/api/tickets/${created.body.id}/bitacora`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .expect(200);
      expect(log.body.data.map((entry: { evento: { tipo: string; detalle: object } }) => entry.evento))
        .toContainEqual(expect.objectContaining({
          tipo: 'NOTIFICACION_FALLIDA',
          detalle: expect.objectContaining({ motivo: 'ERROR_ENVIO' }),
        }));
      expect(JSON.stringify(response.body)).not.toContain('SMTP secret');
    });

  it('allows only AGENTE creation and rejects inactive categories and client-managed fields', async () => {
    await createTicket(supervisorOneToken).expect(403);
    await createTicket(adminToken).expect(403);

    const categories = app.get<CategoriasRepository>(CATEGORIAS_REPOSITORY);
    const inactive = await categories.create({
      nombre: 'Categoría inactiva para e2e',
      activa: false,
      areaSugeridaId: areaOneId,
    });
    await createTicket(agentOneToken, TicketType.INC, { categoriaId: inactive.id })
      .expect(409)
      .expect(({ body }) => expect(body.message).toContain('categoría inactiva'));

    for (const [field, value] of [
      ['numero', 'INC9999'],
      ['estado', 'CERRADO'],
      ['areaActualId', areaTwoId],
      ['creadoPorId', agentTwoToken],
      ['fechaCreacion', clockNow.toISOString()],
      ['fechaUltimaActualizacion', clockNow.toISOString()],
      ['fechaCierre', clockNow.toISOString()],
      ['tiempoPausaAcumuladoSeg', 100],
      ['tiempoPausaHabilAcumuladoSeg', 100],
      ['pausaInicio', clockNow.toISOString()],
      ['estadoAntesDePausa', 'NUEVO'],
      ['motivoPausa', 'client'],
      ['solucion', 'client'],
      ['version', 10],
    ] as const) {
      await createTicket(agentOneToken, TicketType.INC, { [field]: value }).expect(400);
    }
    await createTicket(agentOneToken, TicketType.INC, { titulo: 'abc\u0001def' }).expect(400);
    const nextValid = await createTicket(agentOneToken, TicketType.INC).expect(201);
    expect(nextValid.body.numero).toMatch(/^INC\d{4,}$/);
  });

  it('applies visibility before filters and returns the same 404 for invisible and missing tickets', async () => {
    const own = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const other = await createTicket(agentTwoToken, TicketType.REQ).expect(201);
    const ticketsRepository = app.get<TicketsRepository>(TICKETS_REPOSITORY);
    const foreignTicket = await ticketsRepository.findById(other.body.id);
    if (!foreignTicket) throw new Error('No se encontró el ticket de prueba.');
    await ticketsRepository.actualizar(
      { ...foreignTicket, fechaCreacion: new Date('2026-10-01T14:00:00.000Z') },
      foreignTicket.version,
    );

    const invisibleDetail = await request(app.getHttpServer())
      .get(`/api/tickets/${other.body.id}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(404);
    const missingDetail = await request(app.getHttpServer())
      .get('/api/tickets/not-a-ticket')
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(404);
    expect(invisibleDetail.body.message).toBe(missingDetail.body.message);

    const filteredForeignArea = await request(app.getHttpServer())
      .get(`/api/tickets?areaId=${areaTwoId}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(filteredForeignArea.body.total).toBe(0);
    expect(filteredForeignArea.body.data).toHaveLength(0);

    const filteredForeignSla = await request(app.getHttpServer())
      .get('/api/tickets?slaEstado=VENCIDO&page=1&pageSize=1')
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(filteredForeignSla.body.total).toBe(0);
    expect(filteredForeignSla.body.data).toHaveLength(0);

    const agentList = await request(app.getHttpServer())
      .get(`/api/tickets?tipo=INC&page=1&pageSize=1`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(agentList.body.page).toBe(1);
    expect(agentList.body.pageSize).toBe(1);
    expect(agentList.body.data).toHaveLength(1);
    expect(agentList.body.total).toBeGreaterThanOrEqual(2);
    expect(agentList.body.data[0].tipo).toBe(TicketType.INC);

    const supervisorOneList = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${supervisorOneToken}`)
      .expect(200);
    expect(supervisorOneList.body.data.every((ticket: { areaActualId: string }) => ticket.areaActualId === areaOneId)).toBe(true);
    expect(supervisorOneList.body.data.some((ticket: { id: string }) => ticket.id === own.body.id)).toBe(true);
    expect(supervisorOneList.body.data.some((ticket: { id: string }) => ticket.id === other.body.id)).toBe(false);

    const supervisorTwoList = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${supervisorTwoToken}`)
      .expect(200);
    expect(supervisorTwoList.body.data.some((ticket: { id: string }) => ticket.id === other.body.id)).toBe(true);

    const adminList = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminList.body.data.some((ticket: { id: string }) => ticket.id === own.body.id)).toBe(true);
    expect(adminList.body.data.some((ticket: { id: string }) => ticket.id === other.body.id)).toBe(true);

    const exactNumber = await request(app.getHttpServer())
      .get(`/api/tickets?numero=${own.body.numero}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(exactNumber.body.total).toBe(1);
    expect(exactNumber.body.data[0].id).toBe(own.body.id);
  });

  it('has no bitácora mutation endpoints', async () => {
    const created = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const path = `/api/tickets/${created.body.id}/bitacora`;
    await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${adminToken}`).expect(404);
    await request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${adminToken}`).expect(404);
    await request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${adminToken}`).expect(404);
    await request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('still shows the event actor name after that user is deactivated', async () => {
    const created = await createTicket(agentTwoToken, TicketType.INC).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/usuarios/${created.body.creadoPorId}/desactivar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const log = await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/bitacora`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(log.body.data[0].usuarioNombre).toBe('Agente Dos');
    const users = app.get<UsuariosRepository>(USUARIOS_REPOSITORY);
    const restoredAgent = await users.update(created.body.creadoPorId as string, {
      activo: true,
    });
    if (!restoredAgent) throw new Error('No se pudo restaurar el agente de prueba.');
    const sessionId = randomUUID();
    await app.get<SessionsRepository>(USUARIOS_SESSIONS_REPOSITORY).create({
      id: sessionId,
      usuarioId: restoredAgent.id,
      ultimaActividad: new Date(clockNow),
    });
    agentTwoToken = app.get(JwtService).sign({
      sub: restoredAgent.id,
      sid: sessionId,
      correo: restoredAgent.correo,
      rol: restoredAgent.rol,
      areaId: restoredAgent.areaId,
    });
  });

  it('runs creation, two escalations, pause, resume, and close with ordered audit and escalation history', async () => {
    const created = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const firstEscalation = await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/escalar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({
        areaId: areaTwoId,
        recibidoPorId: (await app.get<UsuariosRepository>(USUARIOS_REPOSITORY).findByEmail(
          'agente.dos@tickets.example.com',
        ))!.id,
        comentario: 'Enviar al segundo equipo',
      });
    expect(firstEscalation.status, JSON.stringify(firstEscalation.body)).toBe(201);
    expect(firstEscalation.body).toMatchObject({
      areaActualId: areaTwoId,
      estado: 'ESCALADO',
    });
    expect(firstEscalation.body).not.toHaveProperty('version');

    const agentOneUser = (await app
      .get<UsuariosRepository>(USUARIOS_REPOSITORY)
      .findByEmail('agente.uno@tickets.example.com'))!;
    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/escalar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({
        areaId: areaOneId,
        recibidoPorId: agentOneUser.id,
        comentario: 'Retorno al equipo inicial',
      })
      .expect(201);

    const pause = await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/pausar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({ motivo: 'Esperando confirmación' })
      .expect(201);
    expect(pause.body).toMatchObject({
      estado: 'EN_PAUSA',
      estadoAntesDePausa: 'ESCALADO',
    });
    expect(pause.body).not.toHaveProperty('version');

    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/cerrar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({ solucion: 'Se verificó la solución final.' })
      .expect(409)
      .expect(({ body }) => expect(body.message).toContain('Reanuda el ticket antes de cerrarlo.'));
    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/escalar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({
        areaId: areaTwoId,
        recibidoPorId: agentOneUser.id,
        comentario: 'No se puede escalar en pausa',
      })
      .expect(409);

    clockNow = new Date(clockNow.getTime() + 75_000);
    const resumed = await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/reanudar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(201);
    expect(resumed.body).toMatchObject({
      estado: 'ESCALADO',
      tiempoPausaAcumuladoSeg: 75,
      tiempoPausaHabilAcumuladoSeg: 0,
      pausaInicio: null,
      estadoAntesDePausa: null,
      motivoPausa: null,
    });

    const closed = await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/cerrar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({ solucion: 'Se verificó la solución final.' })
      .expect(201);
    expect(closed.body).toMatchObject({ estado: 'CERRADO' });
    expect(closed.body).not.toHaveProperty('version');
    expect(closed.body.fechaCierre).toBe(clockNow.toISOString());

    const history = await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/escalamientos`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0]).toMatchObject({
      area: { id: areaTwoId },
      asignadoPor: { id: agentOneId, nombre: 'Agente Uno' },
      recibidoPor: { nombre: 'Agente Dos' },
    });
    expect(history.body[1]).toMatchObject({
      area: { id: areaOneId },
      recibidoPor: { nombre: 'Agente Uno' },
    });
    expect(new Date(history.body[0].fecha).toISOString()).toBe(history.body[0].fecha);

    const log = await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/bitacora`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(log.body.data.map((item: { evento: { tipo: string } }) => item.evento.tipo)).toEqual([
      'CREACION',
      'NOTIFICACION_ENVIADA',
      'ESCALAMIENTO',
      'NOTIFICACION_ENVIADA',
      'ESCALAMIENTO',
      'NOTIFICACION_ENVIADA',
      'PAUSA',
      'REANUDACION',
      'CIERRE',
      'NOTIFICACION_ENVIADA',
    ]);
    expect(log.body.data.every((item: { usuarioNombre: string; fecha: string }) =>
      item.usuarioNombre === 'Agente Uno' && /^\d{4}-\d{2}-\d{2}$/.test(item.fecha),
    )).toBe(true);

    for (const [action, body] of [
      ['escalar', { areaId: areaTwoId, comentario: 'Ticket ya cerrado' }],
      ['pausar', { motivo: 'Ticket ya cerrado' }],
      ['reanudar', {}],
      ['cerrar', { solucion: 'No hay cambios posteriores.' }],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/api/tickets/${created.body.id}/${action}`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send(body)
        .expect(409);
    }
    const closedHistory = await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/bitacora`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(closedHistory.body.total).toBe(10);
  });

  it('returns 403 to ADMINISTRADOR for all four actions', async () => {
    const created = await createTicket(agentOneToken, TicketType.INC).expect(201);
    for (const [action, body] of [
      ['escalar', { areaId: areaTwoId, comentario: 'Asignación nueva' }],
      ['pausar', { motivo: 'Esperar revisión' }],
      ['reanudar', {}],
      ['cerrar', { solucion: 'No permitido para administrador.' }],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/api/tickets/${created.body.id}/${action}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(403);
    }
  });

  it('allows supervisor closure only within its current area', async () => {
    const ownAreaTicket = await createTicket(agentOneToken, TicketType.INC).expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ownAreaTicket.body.id}/cerrar`)
      .set('Authorization', `Bearer ${supervisorTwoToken}`)
      .send({ solucion: 'No visible al otro supervisor.' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ownAreaTicket.body.id}/cerrar`)
      .set('Authorization', `Bearer ${supervisorOneToken}`)
      .send({ solucion: 'Cierre autorizado por el supervisor.' })
      .expect(201);
  });

  it('revokes an agent assignment when the latest escalation assigns the ticket elsewhere', async () => {
    const created = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const users = app.get<UsuariosRepository>(USUARIOS_REPOSITORY);
    const agentTwo = (await users.findByEmail('agente.dos@tickets.example.com'))!;
    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/escalar`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .send({
        areaId: areaTwoId,
        recibidoPorId: agentTwo.id,
        comentario: 'Asignar al agente dos',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${agentTwoToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/escalar`)
      .set('Authorization', `Bearer ${agentTwoToken}`)
      .send({
        areaId: areaOneId,
        recibidoPorId: agentOneId,
        comentario: 'Reasignación al primer agente',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${agentTwoToken}`)
      .expect(404);
    const agentTwoList = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${agentTwoToken}`)
      .expect(200);
    expect(agentTwoList.body.data.some((ticket: { id: string }) => ticket.id === created.body.id)).toBe(false);
  });

  it('allows exactly one of concurrent close and escalation and keeps the final ticket coherent', async () => {
    const closeEscalateTicket = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const mailer = app.get(InMemoryMailer);
    const beforeAction = mailer.bandeja().length;
    const closeEscalate = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/tickets/${closeEscalateTicket.body.id}/cerrar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ solucion: 'Cierre en carrera concurrente.' }),
      request(app.getHttpServer())
        .post(`/api/tickets/${closeEscalateTicket.body.id}/escalar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({
          areaId: areaTwoId,
          comentario: 'Escalamiento en carrera',
        }),
    ]);
    expect(closeEscalate.filter((response) => response.status === 201)).toHaveLength(1);
    expect(closeEscalate.filter((response) => response.status === 409)).toHaveLength(1);
    const finalTicket = await request(app.getHttpServer())
      .get(`/api/tickets/${closeEscalateTicket.body.id}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(['CERRADO', 'ESCALADO']).toContain(finalTicket.body.estado);
    expect(mailer.bandeja()).toHaveLength(beforeAction + 1);
  });

  it('filters SLA state after visibility and before pagination', async () => {
    const visible = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const invisible = await createTicket(agentTwoToken, TicketType.INC).expect(201);
    const repository = app.get<TicketsRepository>(TICKETS_REPOSITORY);
    for (const id of [visible.body.id as string, invisible.body.id as string]) {
      const ticket = await repository.findById(id);
      if (!ticket) throw new Error('No se encontró el ticket de prueba.');
      await repository.actualizar(
        { ...ticket, fechaCreacion: new Date('1900-01-01T08:00:00.000Z') },
        ticket.version,
      );
    }

    const firstPage = await request(app.getHttpServer())
      .get('/api/tickets?slaEstado=VENCIDO&page=1&pageSize=1')
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(firstPage.body).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.data[0].id).toBe(visible.body.id);

    const secondPage = await request(app.getHttpServer())
      .get('/api/tickets?slaEstado=VENCIDO&page=2&pageSize=1')
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(secondPage.body).toMatchObject({ page: 2, pageSize: 1, total: 1 });
    expect(secondPage.body.data).toHaveLength(0);
  });

  it('applies only one of two simultaneous pauses', async () => {
    const pauseTicket = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const pauses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/tickets/${pauseTicket.body.id}/pausar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ motivo: 'Primera pausa' }),
      request(app.getHttpServer())
        .post(`/api/tickets/${pauseTicket.body.id}/pausar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ motivo: 'Segunda pausa' }),
    ]);
    expect(pauses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(pauses.filter((response) => response.status === 409)).toHaveLength(1);
    const current = await request(app.getHttpServer())
      .get(`/api/tickets/${pauseTicket.body.id}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(current.body.estado).toBe('EN_PAUSA');
    expect(current.body).not.toHaveProperty('version');
  });

  it('records only one CIERRE when two simultaneous closes race', async () => {
    const closeTicket = await createTicket(agentOneToken, TicketType.INC).expect(201);
    const mailer = app.get(InMemoryMailer);
    const beforeClose = mailer.bandeja().length;
    const closes = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/tickets/${closeTicket.body.id}/cerrar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ solucion: 'Primera solución registrada.' }),
      request(app.getHttpServer())
        .post(`/api/tickets/${closeTicket.body.id}/cerrar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ solucion: 'Segunda solución registrada.' }),
    ]);
    expect(closes.filter((response) => response.status === 201)).toHaveLength(1);
    expect(closes.filter((response) => response.status === 409)).toHaveLength(1);
    const log = await request(app.getHttpServer())
      .get(`/api/tickets/${closeTicket.body.id}/bitacora`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200);
    expect(log.body.data.filter((item: { evento: { tipo: string } }) =>
      item.evento.tipo === 'CIERRE',
    )).toHaveLength(1);
    expect(mailer.bandeja()).toHaveLength(beforeClose + 1);
  });

  it('safely marks tickets older than the SLA iteration limit on both support views', async () => {
    const created = await createTicket(agentOneToken).expect(201);
    const repository = app.get<TicketsRepository>(TICKETS_REPOSITORY);
    const ticket = await repository.findById(created.body.id as string);
    if (!ticket) throw new Error('No se encontró el ticket de prueba.');
    await repository.actualizar(
      { ...ticket, fechaCreacion: new Date('1900-01-01T08:00:00.000Z') },
      ticket.version,
    );

    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.sla).toMatchObject({
        estado: 'VENCIDO',
        calculoLimitado: true,
      }));
    await request(app.getHttpServer())
      .get(`/api/tickets?numero=${created.body.numero}`)
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.data[0].sla).toMatchObject({
        estado: 'VENCIDO',
        calculoLimitado: true,
      }));
    await request(app.getHttpServer())
      .get('/api/supervisor/tickets')
      .set('Authorization', `Bearer ${supervisorOneToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
        const oldTicket = body.data.find((row: { id: string }) => row.id === created.body.id);
        expect(oldTicket.sla).toMatchObject({
          estado: 'VENCIDO',
          calculoLimitado: true,
        });
      });
  });

  it('returns supervisor-area tickets with batched escalation history and SLA only to supervisors', async () => {
    const assignedAgent = (await app
      .get<UsuariosRepository>(USUARIOS_REPOSITORY)
      .findByEmail('agente.uno@tickets.example.com'))!;
    const assigned = await createTicket(agentTwoToken, TicketType.INC).expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${assigned.body.id}/escalar`)
      .set('Authorization', `Bearer ${agentTwoToken}`)
      .send({
        areaId: areaOneId,
        recibidoPorId: assignedAgent.id,
        comentario: 'Asignar al área del supervisor',
      })
      .expect(201);
    const foreign = await createTicket(agentTwoToken, TicketType.REQ).expect(201);

    const supervisorPage = await request(app.getHttpServer())
      .get('/api/supervisor/tickets?slaEstado=DENTRO_DEL_PLAZO&page=1&pageSize=1')
      .set('Authorization', `Bearer ${supervisorOneToken}`)
      .expect(200);
    expect(supervisorPage.body.page).toBe(1);
    expect(supervisorPage.body.pageSize).toBe(1);
    expect(supervisorPage.body.total).toBeGreaterThan(0);
    expect(supervisorPage.body.data).toHaveLength(1);
    expect(supervisorPage.body.data[0]).toHaveProperty('sla.estado', 'DENTRO_DEL_PLAZO');
    expect(supervisorPage.body.data[0].areaActualId).toBe(areaOneId);

    const allSupervisorTickets = await request(app.getHttpServer())
      .get('/api/supervisor/tickets?slaEstado=DENTRO_DEL_PLAZO&pageSize=100')
      .set('Authorization', `Bearer ${supervisorOneToken}`)
      .expect(200);
    expect(allSupervisorTickets.body.data.every(
      (ticket: { areaActualId: string }) => ticket.areaActualId === areaOneId,
    )).toBe(true);
    expect(allSupervisorTickets.body.data.some(
      (ticket: { id: string }) => ticket.id === foreign.body.id,
    )).toBe(false);
    const assignedResponse = allSupervisorTickets.body.data.find(
      (ticket: { id: string }) => ticket.id === assigned.body.id,
    );
    expect(assignedResponse.escalamientos).toHaveLength(1);
    expect(assignedResponse.escalamientos[0]).toMatchObject({
      area: { id: areaOneId },
      asignadoPor: { nombre: 'Agente Dos' },
      recibidoPor: { nombre: 'Agente Uno' },
    });
    expect(assignedResponse.sla).toHaveProperty('limiteHoras');

    await request(app.getHttpServer())
      .get('/api/supervisor/tickets')
      .set('Authorization', `Bearer ${agentOneToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/supervisor/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('subtracts only business pause hours when resuming on Monday after pausing Friday', async () => {
    const sessions = app.get<SessionsRepository>(USUARIOS_SESSIONS_REPOSITORY);
    const decoded = app.get(JwtService).decode(agentOneToken) as { sid: string };
    const originalClock = new Date(clockNow);
    try {
      clockNow = new Date('2026-10-23T21:30:00.000Z');
      await sessions.updateActivity(decoded.sid, new Date(clockNow));
      const ticket = await createTicket(agentOneToken, TicketType.INC).expect(201);

      clockNow = new Date('2026-10-23T22:30:00.000Z');
      await sessions.updateActivity(decoded.sid, new Date('2026-10-23T22:29:00.000Z'));
      await request(app.getHttpServer())
        .post(`/api/tickets/${ticket.body.id}/pausar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .send({ motivo: 'Esperando al siguiente día hábil' })
        .expect(201);

      clockNow = new Date('2026-10-26T14:30:00.000Z');
      await sessions.updateActivity(decoded.sid, new Date('2026-10-26T14:29:00.000Z'));
      const resumed = await request(app.getHttpServer())
        .post(`/api/tickets/${ticket.body.id}/reanudar`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .expect(201);
      expect(resumed.body.tiempoPausaHabilAcumuladoSeg).toBe(3600);
      expect(resumed.body.tiempoPausaAcumuladoSeg).toBeGreaterThan(60 * 60 * 24);

      const log = await request(app.getHttpServer())
        .get(`/api/tickets/${ticket.body.id}/bitacora`)
        .set('Authorization', `Bearer ${agentOneToken}`)
        .expect(200);
      const resumeEvent = log.body.data.find(
        (item: { evento: { tipo: string } }) => item.evento.tipo === 'REANUDACION',
      );
      expect(resumeEvent.evento.detalle).toMatchObject({
        segundosPausaHabil: 3600,
        tiempoPausaHabilAcumuladoSeg: 3600,
      });
    } finally {
      clockNow = originalClock;
    }
  });
});
