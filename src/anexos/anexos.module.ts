import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClockModule } from '../common/clock/clock.module.js';
import { RepositoriesModule } from '../common/persistence/repositories.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AnexosController } from './anexos.controller.js';
import { FILE_STORAGE } from './anexos.constants.js';
import { AnexosService } from './anexos.service.js';
import { DiskFileStorage } from './storage/disk-file-storage.js';
import { AttachmentFilesInterceptor } from './attachment-files.interceptor.js';

@Module({
  imports: [ClockModule, ConfigModule, RepositoriesModule, TicketsModule, UsuariosModule],
  controllers: [AnexosController],
  providers: [
    {
      provide: FILE_STORAGE,
      useFactory: (config: ConfigService) =>
        new DiskFileStorage(config.get<string>('UPLOADS_DIR', './uploads')),
      inject: [ConfigService],
    },
    AttachmentFilesInterceptor,
    AnexosService,
  ],
})
export class AnexosModule {}
