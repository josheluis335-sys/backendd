import { Module } from '@nestjs/common';
import { AreasController } from './areas.controller.js';
import { AreasService } from './areas.service.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';

@Module({
  controllers: [AreasController],
  providers: [AreasService, WriteThrottleGuard],
  exports: [AreasService, WriteThrottleGuard],
})
export class AreasModule {}
