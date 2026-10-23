import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';
import type { Request, Response } from 'express';
import { PublicoService, PublicLookupBlockedException } from './publico.service.js';
import { PUBLIC_LOOKUP_RATE_LIMITED } from './publico.constants.js';
import { PublicTicketResponseDto } from './dto/public-ticket-response.dto.js';

@ApiTags('portal público')
@Controller('publico')
export class PublicoController {
  constructor(private readonly service: PublicoService) {}

  @Public()
  @Post('consulta')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Consultar públicamente el estado de un caso' })
  @ApiOkResponse({ type: PublicTicketResponseDto })
  @ApiNotFoundResponse({ description: 'No se encontró un ticket con esos datos.' })
  @ApiTooManyRequestsResponse({ description: 'Consulta temporalmente bloqueada.' })
  async consultar(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Robots-Tag', 'noindex');
    try {
      return await this.service.consultar(request.ip ?? 'unknown', body);
    } catch (error) {
      if (error instanceof PublicLookupBlockedException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
        throw new HttpException(
          PUBLIC_LOOKUP_RATE_LIMITED,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }
}
