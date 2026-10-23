import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api (GET) requires a bearer token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'admin-test@example.com', password: 'test-admin-password-123' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200)
      .expect('Mesa de Servicio API');
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
