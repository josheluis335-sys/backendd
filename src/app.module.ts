import { Module } from '@nestjs/common';
import { APP_FILTER, DiscoveryModule } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnvironment } from './config/env.validation.js';
import { RoutePolicyValidator } from './common/route-policy.validator.js';
import { AreasModule } from './areas/areas.module.js';
import { CategoriasModule } from './categorias/categorias.module.js';
import { RepositoriesModule } from './common/persistence/repositories.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { BitacoraModule } from './bitacora/bitacora.module.js';
import { ClockModule } from './common/clock/clock.module.js';
import { EscalamientosModule } from './escalamientos/escalamientos.module.js';
import { SlaModule } from './sla/sla.module.js';
import { AnotacionesModule } from './anotaciones/anotaciones.module.js';
import { AnexosModule } from './anexos/anexos.module.js';
import { NotificacionesModule } from './notificaciones/notificaciones.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { ComunicacionesModule } from './comunicaciones/comunicaciones.module.js';
import { PublicoModule } from './publico/publico.module.js';
import { SaludModule } from './salud/salud.module.js';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test'] : ['.env'],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    ClockModule,
    DiscoveryModule,
    RepositoriesModule,
    AuthModule,
    AreasModule,
    CategoriasModule,
    UsuariosModule,
    BitacoraModule,
    EscalamientosModule,
    SlaModule,
    TicketsModule,
    AnotacionesModule,
    AnexosModule,
    NotificacionesModule,
    ComunicacionesModule,
    PublicoModule,
    SaludModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RoutePolicyValidator,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
