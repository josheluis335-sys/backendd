import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitacoraModule } from '../bitacora/bitacora.module.js';
import { ConsoleMailer } from './mailers/console-mailer.js';
import { InMemoryMailer } from './mailers/in-memory-mailer.js';
import { SmtpMailer } from './mailers/smtp-mailer.js';
import { MAILER } from './notificaciones.constants.js';
import { NotificacionesService } from './notificaciones.service.js';

@Module({
  imports: [BitacoraModule],
  providers: [
    ConsoleMailer,
    InMemoryMailer,
    SmtpMailer,
    {
      provide: MAILER,
      inject: [ConfigService, ConsoleMailer, InMemoryMailer, SmtpMailer],
      useFactory: (
        config: ConfigService,
        consoleMailer: ConsoleMailer,
        inMemoryMailer: InMemoryMailer,
        smtpMailer: SmtpMailer,
      ) => {
        if (process.env.NODE_ENV === 'test') return inMemoryMailer;
        return config.get<string>('MAIL_TRANSPORT') === 'smtp'
          ? smtpMailer
          : consoleMailer;
      },
    },
    NotificacionesService,
  ],
  exports: [NotificacionesService, MAILER, InMemoryMailer],
})
export class NotificacionesModule {}
