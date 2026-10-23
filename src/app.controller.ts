import { Controller, Get } from '@nestjs/common';
import { AnyRole } from './common/decorators/roles.decorator.js';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @AnyRole()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
