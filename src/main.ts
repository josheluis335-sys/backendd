import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { completeOpenApiDocument } from './http/openapi-document.js';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { configureHttpSecurity } from './http/http-security.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger:
      process.env.NODE_ENV === 'test'
        ? (['error'] satisfies LogLevel[])
        : undefined,
  });
  app.setGlobalPrefix('api');
  const config = app.get(ConfigService);
  configureHttpSecurity(app, {
    trustProxy: config.get<boolean>('TRUST_PROXY', false),
    publicOrigins: config
      .get<string>('PORTAL_ORIGENES_PERMITIDOS', '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    supportOrigins: config
      .get<string>('SUPPORT_CORS_ORIGINS', '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  if (config.get<boolean>('SWAGGER_ENABLED', false)) {
    const allowedIps = new Set(
      config
        .get<string>('SWAGGER_ALLOWED_IPS', '')
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean),
    );
    if (config.get<string>('NODE_ENV') === 'production') {
      app.use('/api/docs', (request: Request, response: Response, next: NextFunction) => {
        const address = request.ip ?? request.socket.remoteAddress ?? '';
        if (isAllowedIp(address, allowedIps)) {
          next();
          return;
        }
        response.status(404).end();
      });
      app.use('/api/docs-json', (request: Request, response: Response, next: NextFunction) => {
        const address = request.ip ?? request.socket.remoteAddress ?? '';
        if (isAllowedIp(address, allowedIps)) {
          next();
          return;
        }
        response.status(404).end();
      });
    }
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Mesa de Servicio')
      .setDescription('API interna de la Mesa de Servicio. Las rutas de consulta pública no exponen datos internos.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    completeOpenApiDocument(
      document,
      app.get(DiscoveryService),
      app.get(Reflector),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

function isAllowedIp(address: string, allowedIps: Set<string>): boolean {
  const normalizedAddress = address.startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : address;
  return allowedIps.has(address) || allowedIps.has(normalizedAddress);
}
await bootstrap();
