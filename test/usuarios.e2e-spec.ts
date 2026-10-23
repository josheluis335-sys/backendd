import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';
import { AppModule } from '../src/app.module.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';

describe('UsuariosController (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let agentToken: string;
  let supervisorToken: string;
  let areaId: string;
  let agentId: string;

  const baseUser = {
    nombre: 'Agente de API',
    correo: 'api-agent@example.com',
    password: 'ApiAgentPass123',
    rol: UserRole.AGENTE,
  };

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
    const activeAreas = await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true);
    areaId = activeAreas[0].id;
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);
    adminToken = adminLogin.body.access_token as string;

    const agent = await users.create({
      nombre: 'Agente de permisos',
      correo: 'permissions-agent@example.com',
      passwordHash: 'unused-test-hash',
      rol: UserRole.AGENTE,
      areaId,
      activo: true,
    });
    const supervisor = await users.create({
      nombre: 'Supervisor de permisos',
      correo: 'permissions-supervisor@example.com',
      passwordHash: 'unused-test-hash',
      rol: UserRole.SUPERVISOR,
      areaId,
      activo: true,
    });
    agentId = agent.id;
    const tokenFor = async (user: typeof agent, sessionId: string) => {
      await sessions.create({
        id: sessionId,
        usuarioId: user.id,
        ultimaActividad: new Date(),
      });
      return jwt.sign({
        sub: user.id,
        sid: sessionId,
        correo: user.correo,
        rol: user.rol,
        areaId: user.areaId,
      });
    };
    agentToken = await tokenFor(agent, 'usuarios-agent-session');
    supervisorToken = await tokenFor(supervisor, 'usuarios-supervisor-session');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createUser(
    correo: string,
    nombre = 'Usuario temporal',
  ): Promise<{ id: string; body: Record<string, unknown> }> {
    const response = await request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseUser, nombre, correo, areaId })
      .expect(201);
    return { id: response.body.id as string, body: response.body };
  }

  function login(correo: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password });
  }

  it('exposes admin user endpoints without hashes and normalizes email', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...baseUser,
        nombre: '  Usuario API  ',
        correo: '  New.User@Example.com ',
        areaId,
      })
      .expect(201);
    expect(created.body.nombre).toBe('Usuario API');
    expect(created.body.correo).toBe('new.user@example.com');
    expect(created.body).not.toHaveProperty('passwordHash');

    const listed = await request(app.getHttpServer())
      .get('/api/usuarios?activo=true&page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id })]),
    );
    expect(JSON.stringify(listed.body)).not.toContain('passwordHash');

    const detail = await request(app.getHttpServer())
      .get(`/api/usuarios/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body).not.toHaveProperty('passwordHash');

    const updated = await request(app.getHttpServer())
      .patch(`/api/usuarios/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Nombre actualizado' })
      .expect(200);
    expect(updated.body.nombre).toBe('Nombre actualizado');
    expect(updated.body).not.toHaveProperty('passwordHash');

    const duplicate = await request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseUser, correo: ' NEW.USER@example.com ', areaId })
      .expect(409);
    expect(duplicate.body.message).toContain('Ya existe un usuario');
  });

  it('returns a safe active directory to support roles without email or hashes', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/usuarios/directorio?areaId=${areaId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agentId,
          nombre: 'Agente de permisos',
          rol: UserRole.AGENTE,
          area: expect.objectContaining({ id: areaId }),
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('correo');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.body.every((user: { activo?: boolean }) => user.activo === undefined)).toBe(
      true,
    );
  });

  it('denies AGENTE and SUPERVISOR on every non-directory endpoint', async () => {
    const { id: targetId } = await createUser('role-matrix@example.com');
    for (const token of [agentToken, supervisorToken]) {
      const auth = `Bearer ${token}`;
      await request(app.getHttpServer()).get('/api/usuarios').set('Authorization', auth).expect(403);
      await request(app.getHttpServer())
        .get(`/api/usuarios/${targetId}`)
        .set('Authorization', auth)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/usuarios')
        .set('Authorization', auth)
        .send({ ...baseUser, correo: `denied-${targetId}@example.com`, areaId })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/usuarios/${targetId}`)
        .set('Authorization', auth)
        .send({ nombre: 'No permitido' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/usuarios/${targetId}/desactivar`)
        .set('Authorization', auth)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/usuarios/${targetId}/activar`)
        .set('Authorization', auth)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/usuarios/${targetId}/restablecer-password`)
        .set('Authorization', auth)
        .send({ password: 'UpdatedPassword123' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/usuarios/directorio')
        .set('Authorization', auth)
        .expect(200);
    }
  });

  it('closes active sessions immediately after real user deactivation', async () => {
    const { id } = await createUser('deactivate-flow@example.com');
    const userLogin = await login('deactivate-flow@example.com', baseUser.password).expect(201);
    const token = userLogin.body.access_token as string;
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/usuarios/${id}/desactivar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(deactivated.body.activo).toBe(false);
    expect(deactivated.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await login('deactivate-flow@example.com', baseUser.password).expect(401);

    const inactiveDirectory = await request(app.getHttpServer())
      .get('/api/usuarios/directorio')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inactiveDirectory.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const activated = await request(app.getHttpServer())
      .patch(`/api/usuarios/${id}/activar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(activated.body.activo).toBe(true);
    expect(activated.body).not.toHaveProperty('passwordHash');
    const directory = await request(app.getHttpServer())
      .get('/api/usuarios/directorio')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(directory.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  it('closes active sessions immediately after role and area changes', async () => {
    const { id } = await createUser('change-session-flow@example.com');
    const initialLogin = await login('change-session-flow@example.com', baseUser.password).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/usuarios/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rol: UserRole.SUPERVISOR })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${initialLogin.body.access_token as string}`)
      .expect(401);

    const roleChangeLogin = await login(
      'change-session-flow@example.com',
      baseUser.password,
    ).expect(201);
    const activeAreas = await app
      .get<AreasRepository>(AREAS_REPOSITORY)
      .findAll(true);
    const otherArea = activeAreas.find((area) => area.id !== areaId);
    expect(otherArea).toBeDefined();
    await request(app.getHttpServer())
      .patch(`/api/usuarios/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ areaId: otherArea!.id })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${roleChangeLogin.body.access_token as string}`)
      .expect(401);
  });

  it('resets a password, closes the old session, and permits login with the new password', async () => {
    const { id } = await createUser('reset-flow@example.com');
    const oldPassword = await login('reset-flow@example.com', baseUser.password).expect(201);
    const oldToken = oldPassword.body.access_token as string;

    const reset = await request(app.getHttpServer())
      .post(`/api/usuarios/${id}/restablecer-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'NewStrongPassword123' })
      .expect(201);
    expect(JSON.stringify(reset.body)).not.toContain('passwordHash');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
    await login('reset-flow@example.com', baseUser.password).expect(401);
    const newLogin = await login('reset-flow@example.com', 'NewStrongPassword123').expect(201);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newLogin.body.access_token as string}`)
      .expect(200);
  });

  it('validates the password policy and rejects nonexistent IDs', async () => {
    await request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseUser, correo: 'bad-password@example.com', password: 'bad', areaId })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/usuarios/missing-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
