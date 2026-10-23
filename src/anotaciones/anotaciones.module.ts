import { Module } from '@nestjs/common';
import { ClockModule } from '../common/clock/clock.module.js';
import { RepositoriesModule } from '../common/persistence/repositories.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AnotacionesController } from './anotaciones.controller.js';
import { AnotacionesService } from './anotaciones.service.js';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ClockModule, ConfigModule, RepositoriesModule, TicketsModule, UsuariosModule],
  controllers: [AnotacionesController],
  providers: [AnotacionesService],
})
export class AnotacionesModule {}
