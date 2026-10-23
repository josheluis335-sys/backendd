import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';
import { CATEGORIAS_REPOSITORY } from '../src/categorias/categorias.constants.js';
import type { CategoriasRepository } from '../src/categorias/interfaces/categorias.repository.interface.js';
import { AppModule } from '../src/app.module.js';
import { FILE_STORAGE } from '../src/anexos/anexos.constants.js';
import { InMemoryFileStorage } from '../src/anexos/storage/in-memory-file-storage.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { ClockService } from '../src/common/clock/clock.service.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import {
  USUARIOS_REPOSITORY,
  USUARIOS_SESSIONS_REPOSITORY,
} from '../src/usuarios/usuarios.constants.js';
import { TicketChannel, TicketPriority, TicketType } from '../src/tickets/entities/ticket.entity.js';
import { TICKETS_REPOSITORY } from '../src/tickets/tickets.constants.js';
import type { TicketsRepository } from '../src/tickets/interfaces/tickets.repository.interface.js';

describe('ticket annotations and attachments (e2e)', () => {
  let app: INestApplication<App>;
  let agentToken: string;
  let otherAgentToken: string;
  let supervisorToken: string;
  let adminToken: string;
  let areaId: string;
  let categoryId: string;
  let clockNow = new Date('2026-10-23T12:00:00.000Z');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FILE_STORAGE)
      .useClass(InMemoryFileStorage)
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
    const area = (await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true))[0];
    areaId = area.id;
    categoryId = (await app.get<CategoriasRepository>(CATEGORIAS_REPOSITORY).findAll(true))[0].id;

    const createToken = async (name: string, role: UserRole) => {
      const user = await users.create({
        nombre: name,
        correo: `${name.toLowerCase().replaceAll(' ', '.')}@attachments.example.com`,
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
      return jwt.sign({
        sub: user.id,
        sid: sessionId,
        correo: user.correo,
        rol: user.rol,
        areaId: user.areaId,
      });
    };

    agentToken = await createToken('Agente Anotaciones', UserRole.AGENTE);
    otherAgentToken = await createToken('Agente Ajeno', UserRole.AGENTE);
    supervisorToken = await createToken('Supervisor Anotaciones', UserRole.SUPERVISOR);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);
    adminToken = adminLogin.body.access_token as string;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function createTicket(token: string) {
    return request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TicketType.INC,
        titulo: 'Falla en inicio de sesión',
        descripcion: 'La persona solicitante no puede ingresar al sistema.',
        categoriaId: categoryId,
        prioridad: TicketPriority.MEDIA,
        canal: TicketChannel.CHAT,
        solicitanteNombre: 'Persona solicitante',
        solicitanteCorreo: 'persona@example.com',
      });
  }

  it('creates, lists, and enforces role, visibility, and closed-ticket rules for internal annotations', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ texto: '  Revisar el registro interno  ' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.texto).toBe('Revisar el registro interno');
        expect(body.autorId).toBeDefined();
        expect(body.fecha).toBeDefined();
      });

    const list = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(list.body.data[0].autor.nombre).toBe('Agente Anotaciones');
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ texto: 'Anotación no autorizada' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${otherAgentToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/cerrar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ solucion: 'Se restauró el acceso al sistema.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ texto: 'No debe guardarse' })
      .expect(409);
  });

  it('validates and serves attachments without exposing storage keys or paths', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    const pdf = Buffer.from('%PDF-1.7 contenido de prueba');
    const uploaded = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', pdf, { filename: 'evidencia.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(uploaded.body).toHaveLength(1);
    expect(uploaded.body[0]).not.toHaveProperty('claveAlmacenada');
    expect(JSON.stringify(uploaded.body)).not.toContain('uploads');
    const attachmentId = uploaded.body[0].id as string;
    const listed = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(listed.body).toMatchObject({ total: 1, data: [{ nombreOriginal: 'evidencia.pdf' }] });
    await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos/${attachmentId}/descargar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200)
      .expect('Content-Type', 'application/pdf')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('Content-Security-Policy', "default-src 'none'; sandbox")
      .expect('Cache-Control', 'no-store')
      .expect('Content-Disposition', /attachment/);
    await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${otherAgentToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos/${attachmentId}/descargar`)
      .set('Authorization', `Bearer ${otherAgentToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .attach('archivos', pdf, { filename: 'denegado.pdf', contentType: 'application/pdf' })
      .expect(403);
  });

  it('rejects a malformed file batch atomically and cannot upload to closed tickets', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', Buffer.from('%PDF-1.7 correcto'), {
        filename: 'correcto.pdf',
        contentType: 'application/pdf',
      })
      .attach('archivos', Buffer.from('MZ executable'), {
        filename: 'invalido.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);
    const noPartialFiles = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(noPartialFiles.body.total).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/cerrar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ solucion: 'Se completó la atención solicitada.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', Buffer.from('%PDF-1.7 contenido'), {
        filename: 'cerrado.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);
  });

  it('rejects upload fields and files over the configured hard limit', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .field('unexpected', 'value')
      .attach('archivos', Buffer.from('%PDF-1.7 contenido'), {
        filename: 'campo.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    const oversized = Buffer.alloc(10_485_761, 1);
    oversized.write('%PDF-1.7');
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', oversized, { filename: 'grande.pdf', contentType: 'application/pdf' })
      .expect(413);
    clockNow = new Date(clockNow.getTime() + 1000);
  });

  it('serializes annotation and attachment writes against ticket closure', async () => {
    const annotationTicket = await createTicket(agentToken).expect(201);
    const annotationId = annotationTicket.body.id as string;
    const [annotationResponse, annotationCloseResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/tickets/${annotationId}/anotaciones`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ texto: 'Nota concurrente antes del cierre' }),
      request(app.getHttpServer())
        .post(`/api/tickets/${annotationId}/cerrar`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ solucion: 'Se completó la atención solicitada.' }),
    ]);
    expect(annotationCloseResponse.status).toBe(201);
    expect([201, 409]).toContain(annotationResponse.status);
    const annotationList = await request(app.getHttpServer())
      .get(`/api/tickets/${annotationId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(annotationList.body.total).toBe(annotationResponse.status === 201 ? 1 : 0);

    const attachmentTicket = await createTicket(agentToken).expect(201);
    const attachmentTicketId = attachmentTicket.body.id as string;
    const [uploadResponse, attachmentCloseResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/tickets/${attachmentTicketId}/anexos`)
        .set('Authorization', `Bearer ${agentToken}`)
        .attach('archivos', Buffer.from('%PDF-1.7 concurrente'), {
          filename: 'concurrente.pdf',
          contentType: 'application/pdf',
        }),
      request(app.getHttpServer())
        .post(`/api/tickets/${attachmentTicketId}/cerrar`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ solucion: 'Se completó la atención solicitada.' }),
    ]);
    expect(attachmentCloseResponse.status).toBe(201);
    expect([201, 409]).toContain(uploadResponse.status);
    const attachmentList = await request(app.getHttpServer())
      .get(`/api/tickets/${attachmentTicketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(attachmentList.body.total).toBe(uploadResponse.status === 201 ? 1 : 0);
  });

  it('ignores client MIME, accepts CSV, and rejects unsafe formats and filenames', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    const forgedMime = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', Buffer.from('%PDF-1.7 contenido'), {
        filename: 'evidencia.pdf',
        contentType: 'text/plain',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos/${forgedMime.body[0].id}/descargar`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200)
      .expect('Content-Type', 'application/pdf');

    const csv = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', Buffer.from('id,nombre\n1,Persona\n'), {
        filename: 'datos.csv',
        contentType: 'application/octet-stream',
      })
      .expect(201);
    expect(csv.body[0].mimeType).toBe('text/csv');

    for (const [filename, contents] of [
      ['animacion.gif', Buffer.from('GIF89a')],
      ['imagen.webp', Buffer.from('RIFFxxxxWEBP')],
      ['imagen.svg', Buffer.from('<svg></svg>')],
      ['x.php.pdf', Buffer.from('%PDF-1.7 contenido')],
      ['x.pdf.exe', Buffer.from('%PDF-1.7 contenido')],
      ['nulo.txt', Buffer.from([0x61, 0, 0x62])],
      ['malformado.csv', Buffer.from([0xc3, 0x28])],
    ] as const) {
      const rejected = await request(app.getHttpServer())
        .post(`/api/tickets/${ticketId}/anexos`)
        .set('Authorization', `Bearer ${agentToken}`)
        .attach('archivos', contents, { filename, contentType: 'application/pdf' });
      expect(rejected.status, `filename ${filename}`).toBe(400);
    }
    const list = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(list.body.total).toBe(2);
  });

  it('keeps ticket metadata unchanged when an annotation or attachment is added', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    const repository = app.get<TicketsRepository>(TICKETS_REPOSITORY);
    const storedBefore = await repository.findById(ticketId);
    if (!storedBefore) throw new Error('No se encontró el ticket de prueba.');
    const before = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ texto: 'Nota interna' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', Buffer.from('%PDF-1.7 contenido'), {
        filename: 'nota.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const after = await request(app.getHttpServer())
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(before.body).not.toHaveProperty('version');
    expect(after.body).not.toHaveProperty('version');
    expect(after.body).toMatchObject({
      estado: before.body.estado,
      fechaUltimaActualizacion: before.body.fechaUltimaActualizacion,
    });
    const storedAfter = await repository.findById(ticketId);
    expect(storedAfter).toMatchObject({
      version: storedBefore.version,
      estado: storedBefore.estado,
      fechaUltimaActualizacion: storedBefore.fechaUltimaActualizacion,
    });
  });

  it('allows supervisors and administrators to read visible internal data, but not create it', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anotaciones`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ texto: 'Nota visible al soporte' })
      .expect(201);
    const uploaded = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/anexos`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('archivos', Buffer.from('%PDF-1.7 visible'), {
        filename: 'visible.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    for (const token of [supervisorToken, adminToken]) {
      await request(app.getHttpServer())
        .post(`/api/tickets/${ticketId}/anotaciones`)
        .set('Authorization', `Bearer ${token}`)
        .send({ texto: 'No permitido' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/tickets/${ticketId}/anexos`)
        .set('Authorization', `Bearer ${token}`)
        .attach('archivos', Buffer.from('%PDF-1.7 no'), {
          filename: 'denegado.pdf',
          contentType: 'application/pdf',
        })
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/anotaciones`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect(({ body }) => expect(body.total).toBe(1));
      await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/anexos/${uploaded.body[0].id}/descargar`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });

  it('rejects six-file batches atomically and logs sanitized rejection reasons', async () => {
    const created = await createTicket(agentToken).expect(201);
    const ticketId = created.body.id as string;
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const batch = request(app.getHttpServer())
        .post(`/api/tickets/${ticketId}/anexos`)
        .set('Authorization', `Bearer ${agentToken}`);
      for (let index = 0; index < 6; index++) {
        batch.attach('archivos', Buffer.from(`%PDF-1.7 file-${index}`), {
          filename: `file-${index}.pdf`,
          contentType: 'application/pdf',
        });
      }
      await batch.expect(400);
      const listing = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/anexos`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      expect(listing.body.total).toBe(0);

      await request(app.getHttpServer())
        .post(`/api/tickets/${ticketId}/anexos`)
        .set('Authorization', `Bearer ${agentToken}`)
        .attach('archivos', Buffer.from('GIF89a'), {
          filename: 'sensible-interno.gif',
          contentType: 'image/gif',
        })
        .expect(400);
      const messages = warnSpy.mock.calls.flat().join(' ');
      expect(messages).toContain(created.body.creadoPorId);
      expect(messages).toContain('TIPO_O_CONTENIDO_INVALIDO');
      expect(messages).not.toContain('sensible-interno.gif');
      expect(messages).not.toContain('uploads');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('throttles annotation and attachment creation routes independently', async () => {
    for (const route of ['anotaciones', 'anexos']) {
      let finalStatus = 0;
      for (let index = 0; index < 31 && finalStatus !== 429; index++) {
        const endpoint = request(app.getHttpServer())
          .post(`/api/tickets/not-a-ticket/${route}`)
          .set('Authorization', `Bearer ${agentToken}`);
        const response =
          route === 'anotaciones'
            ? await endpoint.send({ texto: 'Intento de prueba' })
            : await endpoint;
        finalStatus = response.status;
      }
      expect(finalStatus).toBe(429);
    }
  });
});
