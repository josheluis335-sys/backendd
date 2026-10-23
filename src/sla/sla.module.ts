import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockModule } from '../common/clock/clock.module.js';
import { createSlaConfig } from './sla.config.js';
import { SLA_CONFIG } from './sla.constants.js';
import { SlaService } from './sla.service.js';

@Module({
  imports: [ClockModule],
  providers: [
    {
      provide: SLA_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createSlaConfig({
          SLA_TIMEZONE: configService.getOrThrow<string>('SLA_TIMEZONE'),
          SLA_HORA_INICIO: configService.get<number>('SLA_HORA_INICIO'),
          SLA_HORA_FIN: configService.get<number>('SLA_HORA_FIN'),
          SLA_UMBRAL_PROXIMO: configService.get<number>('SLA_UMBRAL_PROXIMO'),
          SLA_FESTIVOS: configService.get<string>('SLA_FESTIVOS'),
        }),
    },
    SlaService,
  ],
  exports: [SlaService],
})
export class SlaModule {}
