import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { ComunicacionesJob } from '../src/comunicaciones/comunicaciones.job.js';
import { InMemoryMailboxReader } from '../src/comunicaciones/mailbox/in-memory-mailbox-reader.js';
import { InMemoryMailer } from '../src/notificaciones/mailers/in-memory-mailer.js';
import { MAILER } from '../src/notificaciones/notificaciones.constants.js';

describe('full support lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);
    adminToken = login.body.access_token as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('processes email, creates and acts on a ticket, exposes status, audit and three notifications', async () => {
    const areaResponse = await request(app.getHttpServer())
      .get('/api/areas?activa=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const areaId = areaResponse.body[0].id as string;
    const categoryResponse = await request(app.getHttpServer())
      .get('/api/categorias?activa=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const categoryId = categoryResponse.body[0].id as string;

    await request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Agente ciclo integral',
        correo: 'agente-ciclo@example.com',
        password: 'AgentFlow123!',
        rol: 'AGENTE',
        areaId,
      })
      .expect(201);
    const supervisorResponse = await request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Supervisor ciclo integral',
        correo: 'supervisor-ciclo@example.com',
        password: 'SupervisorFlow123!',
        rol: 'SUPERVISOR',
        areaId,
      })
      .expect(201);
    const supervisorId = supervisorResponse.body.id as string;
    const agentLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'agente-ciclo@example.com', password: 'AgentFlow123!' })
      .expect(201);
    const supervisorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'supervisor-ciclo@example.com', password: 'SupervisorFlow123!' })
      .expect(201);
    const agentToken = agentLogin.body.access_token as string;
    const supervisorToken = supervisorLogin.body.access_token as string;

    const mailbox = app.get(InMemoryMailboxReader);
    mailbox.agregar({
      uid: 'full-flow-message-1',
      messageId: '<full-flow-1@example.test>',
      remitenteNombre: 'Solicitante de prueba',
      remitenteCorreo: 'requester@example.test',
      asunto: 'Problema de acceso',
      cuerpo: 'No puedo ingresar al sistema desde esta mañana.',
    });
    await app.get(ComunicacionesJob).procesarBandeja();
    const communications = await request(app.getHttpServer())
      .get('/api/comunicaciones')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(communications.body.total).toBe(1);
    const communicationId = communications.body.data[0].id as string;
    const converted = await request(app.getHttpServer())
      .post(`/api/comunicaciones/${communicationId}/convertir`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ categoriaId: categoryId, tipo: 'INC', prioridad: 'MEDIA' })
      .expect(201);
    const ticketId = converted.body.ticket.id as string;
    const caseNumber = converted.body.ticket.numero as string;
    expect(converted.body.notificacion.estado).toBe('ENVIADA');

    const publicQuery = () =>
      request(app.getHttpServer())
        .post('/api/publico/consulta')
        .send({ numeroCaso: caseNumber, correo: 'requester@example.test' });
    expect((await publicQuery().expect(200)).body.estado).toBe('NUEVO');

    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/escalar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        areaId,
        recibidoPorId: supervisorId,
        comentario: 'Transferir al supervisor del área',
      })
      .expect(201)
      .expect(({ body }) => expect(body.notificacion.estado).toBe('ENVIADA'));
    expect((await publicQuery().expect(200)).body.estado).toBe('ESCALADO');

    const audit = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/bitacora`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(audit.body.data.length).toBeGreaterThanOrEqual(3);

    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ texto: 'Validación interna del flujo integral.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/pausar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ motivo: 'Esperando confirmación del solicitante' })
      .expect(201);
    expect((await publicQuery().expect(200)).body.estado).toBe('EN_PAUSA');
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/reanudar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const closed = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/cerrar`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ solucion: 'Acceso restablecido.' })
      .expect(201);
    expect(closed.body.notificacion.estado).toBe('ENVIADA');
    expect((await publicQuery().expect(200)).body.estado).toBe('CERRADO');

    const mailer = app.get<InMemoryMailer>(MAILER);
    const sent = mailer.bandeja();
    expect(sent).toHaveLength(3);
    expect(sent.map((message) => message.asunto)).toEqual([
      `[Mesa de Servicio] Ticket ${caseNumber} creado`,
      `[Mesa de Servicio] Ticket ${caseNumber} escalado`,
      `[Mesa de Servicio] Ticket ${caseNumber} cerrado`,
    ]);
    expect(JSON.stringify(sent)).not.toContain('Problema de acceso');
    expect(JSON.stringify(sent)).not.toContain('Acceso restablecido.');
  });
});
