import { Global, Module } from '@nestjs/common';
import { AREAS_REPOSITORY } from '../../areas/areas.constants.js';
import { InMemoryAreasRepository } from '../../areas/repositories/in-memory-areas.repository.js';
import { CATEGORIAS_REPOSITORY } from '../../categorias/categorias.constants.js';
import { InMemoryCategoriasRepository } from '../../categorias/repositories/in-memory-categorias.repository.js';
import {
  USUARIOS_REPOSITORY,
  USUARIOS_SESSIONS_REPOSITORY,
} from '../../usuarios/usuarios.constants.js';
import { InMemorySessionsRepository } from '../../usuarios/repositories/in-memory-sessions.repository.js';
import { InMemoryUsuariosRepository } from '../../usuarios/repositories/in-memory-usuarios.repository.js';
import { BITACORA_REPOSITORY } from '../../bitacora/bitacora.constants.js';
import { InMemoryBitacoraRepository } from '../../bitacora/repositories/in-memory-bitacora.repository.js';
import { TICKETS_REPOSITORY } from '../../tickets/tickets.constants.js';
import { InMemoryTicketsRepository } from '../../tickets/repositories/in-memory-tickets.repository.js';
import { ESCALAMIENTOS_REPOSITORY } from '../../escalamientos/escalamientos.constants.js';
import { InMemoryEscalamientosRepository } from '../../escalamientos/repositories/in-memory-escalamientos.repository.js';
import { TicketActionUnitOfWork } from '../clock/ticket-action-unit-of-work.js';
import { TICKET_ACTION_UNIT_OF_WORK } from '../../tickets/tickets.constants.js';
import { ANOTACIONES_REPOSITORY } from '../../anotaciones/anotaciones.constants.js';
import { InMemoryAnotacionesRepository } from '../../anotaciones/repositories/in-memory-anotaciones.repository.js';
import { ANEXOS_REPOSITORY } from '../../anexos/anexos.constants.js';
import { InMemoryAnexosRepository } from '../../anexos/repositories/in-memory-anexos.repository.js';

@Global()
@Module({
  providers: [
    { provide: AREAS_REPOSITORY, useClass: InMemoryAreasRepository },
    { provide: CATEGORIAS_REPOSITORY, useClass: InMemoryCategoriasRepository },
    { provide: USUARIOS_REPOSITORY, useClass: InMemoryUsuariosRepository },
    { provide: USUARIOS_SESSIONS_REPOSITORY, useClass: InMemorySessionsRepository },
    { provide: BITACORA_REPOSITORY, useClass: InMemoryBitacoraRepository },
    { provide: TICKETS_REPOSITORY, useClass: InMemoryTicketsRepository },
    { provide: ESCALAMIENTOS_REPOSITORY, useClass: InMemoryEscalamientosRepository },
    { provide: ANOTACIONES_REPOSITORY, useClass: InMemoryAnotacionesRepository },
    { provide: ANEXOS_REPOSITORY, useClass: InMemoryAnexosRepository },
    { provide: TICKET_ACTION_UNIT_OF_WORK, useExisting: TicketActionUnitOfWork },
  ],
  exports: [
    AREAS_REPOSITORY,
    CATEGORIAS_REPOSITORY,
    USUARIOS_REPOSITORY,
    USUARIOS_SESSIONS_REPOSITORY,
    BITACORA_REPOSITORY,
    TICKETS_REPOSITORY,
    ESCALAMIENTOS_REPOSITORY,
    ANOTACIONES_REPOSITORY,
    ANEXOS_REPOSITORY,
    TICKET_ACTION_UNIT_OF_WORK,
  ],
})
export class RepositoriesModule {}
