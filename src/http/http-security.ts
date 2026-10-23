import type { INestApplication } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { createPublicCorsMiddleware } from '../publico/public-cors.js';

export interface HttpSecurityConfig {
  trustProxy: boolean;
  publicOrigins: string[];
  supportOrigins: string[];
}

export function configureHttpSecurity(
  app: INestApplication,
  config: HttpSecurityConfig,
): void {
  const instance = app.getHttpAdapter().getInstance();
  instance.disable('x-powered-by');
  instance.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use('/api/publico', createPublicCorsMiddleware(config.publicOrigins));
  app.use('/api', (request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith('/publico')) {
      next();
      return;
    }
    const origin = request.headers.origin;
    if (origin && config.supportOrigins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });
  app.use('/api/publico', express.json({ limit: '1kb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
}
