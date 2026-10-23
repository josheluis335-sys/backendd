import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';

describe('AreasController (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let agentToken: string;
  let areaId: string;

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
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);
    adminToken = adminLogin.body.access_token as string;

    const area = (await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true))[0];
    const agent = await users.create({
      nombre: 'Agente de áreas',
      correo: 'areas-agent@example.com',
      passwordHash: 'not-used-in-this-test',
      rol: UserRole.AGENTE,
      areaId: area.id,
      activo: true,
    });
    const sessionId = 'areas-agent-session';
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

  it('lists the five seeded areas to support users and filters by activa', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/areas?activa=true')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);

    expect(response.body).toHaveLength(5);
    expect(response.body.every((area: { activa: boolean }) => area.activa)).toBe(true);
  });

  it('creates an area, trims its name, and rejects duplicate names with 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: '  Mesa de control  ' })
      .expect(201);
    areaId = created.body.id as string;
    expect(created.body.nombre).toBe('Mesa de control');
    expect(created.body.activa).toBe(true);

    await request(app.getHttpServer())
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'mesa DE CONTROL' })
      .expect(409);
  });

  it('edits and deactivates an area without deleting it', async () => {
    await request(app.getHttpServer())
      .patch(`/api/areas/${areaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Centro de control', activa: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.nombre).toBe('Centro de control');
        expect(body.activa).toBe(false);
      });

    await request(app.getHttpServer())
      .get(`/api/areas/${areaId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.activa).toBe(false);
      });
  });

  it('returns 404 for unknown ids and has no delete endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/areas/missing-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/areas/${areaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('allows support users to list but prevents AGENTE create and update', async () => {
    await request(app.getHttpServer())
      .post('/api/areas')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ nombre: 'No permitido' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/areas/${areaId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ activa: true })
      .expect(403);
  });

  it('throttles area writes after the configured per-route attempt limit', async () => {
    let throttled = false;
    for (let attempt = 0; attempt < 31 && !throttled; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/areas')
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
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(429);
  });
});
