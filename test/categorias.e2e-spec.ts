import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import { AppModule } from '../src/app.module.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import { TicketChannel, TicketPriority, TicketType } from '../src/tickets/entities/ticket.entity.js';

describe('CategoriasController (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let agentToken: string;
  let areas: AreasRepository;

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

    const users = app.get<UsuariosRepository>(USUARIOS_REPOSITORY);
    const sessions = app.get<SessionsRepository>(USUARIOS_SESSIONS_REPOSITORY);
    const jwt = app.get(JwtService);
    areas = app.get<AreasRepository>(AREAS_REPOSITORY);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);
    adminToken = adminLogin.body.access_token as string;

    const area = (await areas.findAll(true))[0];
    const agent = await users.create({
      nombre: 'Agente de categorías',
      correo: 'categorias-agent@example.com',
      passwordHash: 'not-used-in-this-test',
      rol: UserRole.AGENTE,
      areaId: area.id,
      activo: true,
    });
    const sessionId = 'categorias-agent-session';
    await sessions.create({
      id: sessionId,
      usuarioId: agent.id,
      ultimaActividad: new Date(),
    });
    agentToken = jwt.sign({
      sub: agent.id,
      sid: sessionId,
      correo: agent.correo,
      rol: agent.rol,
      areaId: area.id,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('lists six seeded categories for support and returns the suggested area', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/categorias?activa=true')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(response.body).toHaveLength(6);

    const categoryId = response.body[0].id as string;
    const suggestedArea = await request(app.getHttpServer())
      .get(`/api/categorias/${categoryId}/area-sugerida`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(suggestedArea.body).toEqual({
      id: response.body[0].areaSugeridaId,
      nombre: 'Seguridad y accesos',
    });
  });

  it('creates, trims, and case-insensitively rejects duplicate category names', async () => {
    const activeAreas = await request(app.getHttpServer())
      .get('/api/areas?activa=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: '  Solicitud especial  ', areaSugeridaId: activeAreas.body[0].id })
      .expect(201);
    expect(created.body.nombre).toBe('Solicitud especial');
    expect(created.body.activa).toBe(true);

    await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'solicitud ESPECIAL', areaSugeridaId: activeAreas.body[0].id })
      .expect(409);
  });

  it('returns 404 for a missing area and 409 for an inactive suggested area', async () => {
    await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Área inexistente',
        areaSugeridaId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(404);

    const inactiveArea = await request(app.getHttpServer())
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Área temporal inactiva' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/areas/${inactiveArea.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activa: false })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Categoría sin área activa', areaSugeridaId: inactiveArea.body.id })
      .expect(409);
  });

  it('returns 409 when the category or suggested area is inactive', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/categorias?activa=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const category = list.body[0] as { id: string; areaSugeridaId: string };

    await request(app.getHttpServer())
      .patch(`/api/categorias/${category.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activa: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/categorias/${category.id}/area-sugerida`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/categorias/${category.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activa: true })
      .expect(200);
    await areas.update(category.areaSugeridaId, { activa: false });
    await request(app.getHttpServer())
      .get(`/api/categorias/${category.id}/area-sugerida`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(409);
    await areas.update(category.areaSugeridaId, { activa: true });
  });

  it('prevents an area from being deactivated while active categories use it', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/categorias?activa=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const category = list.body.find(
      (item: { nombre: string }) => item.nombre === 'Equipos y periféricos',
    ) as { nombre: string; areaSugeridaId: string };

    await request(app.getHttpServer())
      .patch(`/api/areas/${category.areaSugeridaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activa: false })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toContain(category.nombre);
        expect(body.message).toContain('Reasígnalas primero.');
      });

  });

  it('does not change existing tickets when a category area suggestion changes', async () => {
    const activeAreas = await areas.findAll(true);
    const category = await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sugerencia no retroactiva', areaSugeridaId: activeAreas[0].id })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        tipo: TicketType.INC,
        titulo: 'Prueba de área sugerida',
        descripcion: 'El ticket conserva el área original.',
        categoriaId: category.body.id,
        prioridad: TicketPriority.MEDIA,
        canal: TicketChannel.CHAT,
        solicitanteNombre: 'Solicitante HU15',
        solicitanteCorreo: 'hu15@example.com',
      })
      .expect(201);
    const originalAreaId = created.body.areaActualId as string;
    const newSuggestedArea = activeAreas.find((area) => area.id !== originalAreaId);
    expect(newSuggestedArea).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/api/categorias/${category.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ areaSugeridaId: newSuggestedArea!.id })
      .expect(200);
    const existingTicket = await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(existingTicket.body.areaActualId).toBe(originalAreaId);
  });

  it('allows support roles to read but only administrators to create and update', async () => {
    const category = (await request(app.getHttpServer())
      .get('/api/categorias')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200)).body[0] as { id: string; areaSugeridaId: string };

    await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ nombre: 'No permitido', areaSugeridaId: category.areaSugeridaId })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/categorias/${category.id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ activa: false })
      .expect(403);
  });

  it('returns 404 for unknown ids and exposes no delete endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/categorias/missing-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/categorias/missing-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('throttles category writes after the configured per-route attempt limit', async () => {
    let throttled = false;
    for (let attempt = 0; attempt < 31 && !throttled; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/categorias')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      if (response.status === 429) {
        throttled = true;
      } else {
        expect(response.status).toBe(400);
      }
    }
    expect(throttled).toBe(true);
    await request(app.getHttpServer())
      .post('/api/categorias')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(429);
  });
});
