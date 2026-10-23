import { Module } from '@nestjs/common';
import { AreasModule } from '../areas/areas.module.js';
import { UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';
import { WriteThrottleGuard } from './guards/write-throttle.guard.js';

@Module({
  imports: [AreasModule],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    WriteThrottleGuard,
  ],
  exports: [
    UsuariosService,
    WriteThrottleGuard,
  ],
})
export class UsuariosModule {}
