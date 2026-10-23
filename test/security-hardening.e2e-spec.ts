import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureHttpSecurity } from '../src/http/http-security.js';
import { completeOpenApiDocument } from '../src/http/openapi-document.js';

describe('HTTP security and health (e2e)', () => {
  let app: import('@nestjs/common').INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    configureHttpSecurity(app, {
      trustProxy: false,
      publicOrigins: ['http://portal.example.test'],
      supportOrigins: ['http://support.example.test'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes only the minimal public health response and throttles it', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get('/api/salud')
        .expect(200);
      expect(response.body).toEqual({ estado: 'ok' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
    await request(app.getHttpServer()).get('/api/salud').expect(429);
  });

  it('isolates public portal CORS from support CORS', async () => {
    const portal = await request(app.getHttpServer())
      .post('/api/publico/consulta')
      .set('Origin', 'http://portal.example.test')
      .send({ numeroCaso: 'INC0001', correo: 'solicitante@example.test' })
      .expect(404);
    expect(portal.headers['access-control-allow-origin']).toBe(
      'http://portal.example.test',
    );
    expect(portal.headers['access-control-allow-credentials']).toBe('false');

    const supportPreflight = await request(app.getHttpServer())
      .options('/api/areas')
      .set('Origin', 'http://support.example.test')
      .expect(204);
    expect(supportPreflight.headers['access-control-allow-origin']).toBe(
      'http://support.example.test',
    );

    const portalOnSupport = await request(app.getHttpServer())
      .options('/api/areas')
      .set('Origin', 'http://portal.example.test')
      .expect(204);
    expect(portalOnSupport.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('documents DTO schemas, access roles, safe errors, and the strict public response', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Mesa de Servicio').setVersion('test').build(),
    );
    completeOpenApiDocument(
      document,
      app.get(DiscoveryService),
      app.get(Reflector),
    );
    const publicOperation = document.paths['/api/publico/consulta']?.post;
    const areaList = document.paths['/api/areas']?.get;
    const publicResponse = document.components?.schemas?.PublicTicketResponseDto;
    expect(publicOperation?.description).toContain('Acceso: público');
    expect(publicOperation?.security).toBeUndefined();
    expect(areaList?.description).toContain('Roles permitidos');
    expect(areaList?.responses['403']).toMatchObject({
      description: expect.any(String),
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiErrorResponse' },
        },
      },
    });
    expect(publicResponse).toMatchObject({
      type: 'object',
      properties: {
        numero: expect.any(Object),
        tipo: expect.any(Object),
        estado: expect.any(Object),
        fechaUltimaActualizacion: expect.any(Object),
      },
    });
    if (!publicResponse || '$ref' in publicResponse) {
      throw new Error('No se generó el schema público.');
    }
    expect(Object.keys(publicResponse.properties ?? {}).sort()).toEqual([
      'estado',
      'fechaUltimaActualizacion',
      'numero',
      'tipo',
    ]);
    const ticketSchema = document.components?.schemas?.CreateTicketDto;
    expect(ticketSchema).toMatchObject({
      type: 'object',
      properties: {
        titulo: expect.any(Object),
        descripcion: expect.any(Object),
        categoriaId: expect.any(Object),
      },
    });
  });
});
