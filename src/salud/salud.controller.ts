import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';

@Controller()
export class SaludController {
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOkResponse({
    description: 'La API está disponible.',
    schema: {
      type: 'object',
      properties: { estado: { type: 'string', enum: ['ok'] } },
      required: ['estado'],
      additionalProperties: false,
    },
  })
  @ApiTooManyRequestsResponse({ description: 'Se alcanzó el límite de consultas.' })
  @Get('salud')
  salud(): { estado: 'ok' } {
    return { estado: 'ok' };
  }
}
