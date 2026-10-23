import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('Administrator area startup validation', () => {
  it('fails Nest application startup when ADMIN_AREA_NOMBRE does not exist', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, fallback?: string) =>
          key === 'ADMIN_AREA_NOMBRE' ? 'Área inexistente para el seed' : fallback,
        getOrThrow: (key: string) =>
          ({
            JWT_SECRET: 'test-secret-that-is-long-enough-for-hmac-validation',
            JWT_EXPIRES_IN: '8h',
            ADMIN_EMAIL: 'startup-admin@example.com',
            ADMIN_NAME: 'Administrador de arranque',
            ADMIN_PASSWORD: 'StartupAdmin123',
            SLA_TIMEZONE: 'UTC',
          })[key],
      })
      .compile();
    const app = moduleFixture.createNestApplication();

    try {
      await expect(app.init()).rejects.toThrow(
        'El área inicial del administrador "Área inexistente para el seed" no existe o está inactiva.',
      );
    } finally {
      await app.close();
    }
  });
});
