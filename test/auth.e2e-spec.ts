import { INestApplication, Logger, UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtStrategy } from '../src/auth/jwt.strategy.js';
import { RolesGuard } from '../src/common/guards/roles.guard.js';
import { AppModule } from '../src/app.module.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { TestAuthModule } from './test-auth.module.js';
import { USUARIOS_REPOSITORY, USUARIOS_SESSIONS_REPOSITORY } from '../src/usuarios/usuarios.constants.js';
import type { SessionsRepository } from '../src/usuarios/interfaces/sessions.repository.interface.js';
import type { UsuariosRepository } from '../src/usuarios/interfaces/usuarios.repository.interface.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import { AREAS_REPOSITORY } from '../src/areas/areas.constants.js';
import type { AreasRepository } from '../src/areas/interfaces/areas.repository.interface.js';

describe('Authentication security (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;
  let sessions: SessionsRepository;
  let jwt: JwtService;
  let strategy: JwtStrategy;
  let agent: Awaited<ReturnType<UsersRepository['create']>>;
  let agentToken: string;
  let agentSessionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TestAuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    users = app.get<UsuariosRepository>(USUARIOS_REPOSITORY);
    sessions = app.get<SessionsRepository>(USUARIOS_SESSIONS_REPOSITORY);
    jwt = app.get(JwtService);
    strategy = app.get(JwtStrategy);

    const area = (await app.get<AreasRepository>(AREAS_REPOSITORY).findAll(true))[0];
    agent = await users.create({
      nombre: 'Agente de pruebas',
      correo: 'agent-test@example.invalid',
      passwordHash: await bcrypt.hash('agent-test-password', 4),
      rol: UserRole.AGENTE,
      areaId: area.id,
      activo: true,
    });
    agentSessionId = 'agent-test-session';
    await sessions.create({
      id: agentSessionId,
      usuarioId: agent.id,
      ultimaActividad: new Date(),
    });
    agentToken = jwt.sign({
      sub: agent.id,
      sid: agentSessionId,
      correo: agent.correo,
      rol: agent.rol,
      areaId: agent.areaId,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('allows the public login route without a token despite the global role guard', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201)
      .expect((response) => {
        expect(response.body.access_token).toEqual(expect.any(String));
        const decoded = jwt.decode(response.body.access_token, { complete: true });
        expect(decoded.header.alg).toBe('HS256');
        expect(decoded.payload).toHaveProperty('exp');
        expect(response.body.user).not.toHaveProperty('passwordHash');
        expect(JSON.stringify(response.body)).not.toContain(process.env.JWT_SECRET);
      });
  });

  it('rejects a protected route without a token with 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('returns 403 when an AGENTE calls an administrator-only route', async () => {
    await request(app.getHttpServer())
      .get('/api/test-auth/admin-only')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('returns the same 401 response for an unknown email and an incorrect password', async () => {
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'unknown-test@example.com', password: 'wrong-password-123' })
      .expect(401);
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'wrong-password-123' })
      .expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(unknownEmail.body.message).toBe('Credenciales inválidas');
  });

  it('does not expose a public registration route', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').expect(404);
  });

  it('real user deactivation closes the active token immediately with 401', async () => {
    const admin = (await users.list({ activo: true })).find(
      (user) => user.rol === UserRole.ADMINISTRADOR,
    );
    expect(admin).toBeDefined();
    await app.get(UsuariosService).deactivate(agent.id, admin!.id);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(401);
  });

  it('returns a Spanish generic 500 without exposing stack traces', async () => {
    const admin = (await users.list({ activo: true })).find(
      (user) => user.rol === UserRole.ADMINISTRADOR,
    );
    const sessionId = 'admin-error-test-session';
    await sessions.create({
      id: sessionId,
      usuarioId: admin!.id,
      ultimaActividad: new Date(),
    });
    const adminToken = jwt.sign({
      sub: admin!.id,
      sid: sessionId,
      correo: admin!.correo,
      rol: admin!.rol,
      areaId: admin!.areaId,
    });
    const response = await request(app.getHttpServer())
      .get('/api/test-auth/internal-error')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(500);

    expect(response.body.message).toBe('Error interno del servidor.');
    expect(JSON.stringify(response.body)).not.toContain('stack');
    expect(JSON.stringify(response.body)).not.toContain('error interno de prueba');
  });

  it('redacts SMTP_PASS from internal-error logs and responses', async () => {
    const previousPass = process.env.SMTP_PASS;
    const secret = 'smtp-password-must-not-leak';
    process.env.SMTP_PASS = secret;
    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const adminLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
        .expect(201);
      const response = await request(app.getHttpServer())
        .get('/api/test-auth/internal-error')
        .set('Authorization', `Bearer ${adminLogin.body.access_token}`)
        .expect(500);
      const logged = loggerSpy.mock.calls.flat().join(' ');
      expect(logged).not.toContain(secret);
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(response.body.message).toBe('Error interno del servidor.');
    } finally {
      loggerSpy.mockRestore();
      if (previousPass === undefined) delete process.env.SMTP_PASS;
      else process.env.SMTP_PASS = previousPass;
    }
  });

  it('rejects sessions inactive for 30 minutes with 401', async () => {
    vi.useFakeTimers();
    const issuedAt = new Date();
    vi.setSystemTime(issuedAt);
    await sessions.updateActivity(agentSessionId, issuedAt);
    vi.setSystemTime(new Date(issuedAt.getTime() + 30 * 60 * 1000 + 1));

    try {
      await expect(
        (() => strategy.validate({
          sub: agent.id,
          sid: agentSessionId,
          correo: agent.correo,
          rol: agent.rol,
        }))(),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed with 403 when a protected route has no role metadata', () => {
    class UnannotatedController {}
    const handler = () => undefined;
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => handler,
      getClass: () => UnannotatedController,
      switchToHttp: () => ({ getRequest: () => ({ user: { rol: UserRole.AGENTE } }) }),
    };

    expect(() => guard.canActivate(context as never)).toThrow('La ruta no tiene roles autorizados.');
  });

  it('covers every registered route with @Public() or a non-empty @Roles() policy', () => {
    const discovery = app.get(DiscoveryService);
    const reflector = app.get(Reflector);
    const routeNames: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined
        ) {
          continue;
        }
        routeNames.push(`${controller.name}.${name}`);
        const isPublic = reflector.getAllAndOverride<boolean>('isPublic', [
          handler,
          controller,
        ]);
        const roles = reflector.getAllAndOverride<string[]>('roles', [handler, controller]);
        expect(isPublic || (roles !== undefined && roles.length > 0)).toBe(true);
        expect(isPublic !== true || roles === undefined).toBe(true);
      }
    }

    expect(routeNames.length).toBeGreaterThan(0);
  });
});
