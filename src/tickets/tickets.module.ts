import { Module } from '@nestjs/common';
import { AreasModule } from '../areas/areas.module.js';
import { BitacoraModule } from '../bitacora/bitacora.module.js';
import { CategoriasModule } from '../categorias/categorias.module.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { TicketCounterService } from './counter/ticket-counter.service.js';
import { TicketVisibilityPolicy } from './policy/ticket-visibility.policy.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { EscalamientosModule } from '../escalamientos/escalamientos.module.js';
import { EscalamientosController } from '../escalamientos/escalamientos.controller.js';
import { SlaModule } from '../sla/sla.module.js';
import { SupervisorTicketsController } from './supervisor-tickets.controller.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';

@Module({
  imports: [AreasModule, CategoriasModule, BitacoraModule, UsuariosModule, EscalamientosModule, SlaModule, NotificacionesModule],
  controllers: [TicketsController, EscalamientosController, SupervisorTicketsController],
  providers: [TicketsService, TicketCounterService, TicketVisibilityPolicy],
  exports: [TicketsService, TicketVisibilityPolicy],
})
export class TicketsModule {}
