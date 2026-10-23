import { Module } from '@nestjs/common';
import { AreasModule } from '../areas/areas.module.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { EscalamientosService } from './escalamientos.service.js';

@Module({
  imports: [AreasModule, UsuariosModule],
  providers: [EscalamientosService],
  exports: [EscalamientosService],
})
export class EscalamientosModule {}
