import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AttachmentFilesInterceptor } from './attachment-files.interceptor.js';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import type { IncomingAttachment } from './file-validation.js';
import { ListAnexosDto } from './dto/list-anexos.dto.js';
import { AnexosService } from './anexos.service.js';

type UploadedFile = IncomingAttachment;

@ApiTags('anexos')
@ApiBearerAuth()
@Controller('tickets/:id/anexos')
export class AnexosController {
  constructor(private readonly service: AnexosService) {}

  @Post()
  @Roles(UserRole.AGENTE)
  @UseGuards(WriteThrottleGuard)
  @UseInterceptors(AttachmentFilesInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Adjuntar archivos a un ticket abierto' })
  upload(
    @Param('id') id: string,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Req() request: Request & { user: TicketActor },
  ) {
    return this.service.upload(id, files ?? [], request.user);
  }

  @Get()
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar anexos de un ticket visible' })
  list(
    @Param('id') id: string,
    @Query() pagination: ListAnexosDto,
    @Req() request: Request & { user: TicketActor },
  ) {
    return this.service.list(id, request.user, pagination);
  }

  @Get(':anexoId/descargar')
  @Roles(UserRole.AGENTE, UserRole.SUPERVISOR, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Descargar un anexo de un ticket visible' })
  async download(
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
    @Req() request: Request & { user: TicketActor },
    @Res() response: Response,
  ): Promise<void> {
    const { metadata, contents } = await this.service.download(id, anexoId, request.user);
    const encodedName = encodeURIComponent(metadata.nombreOriginal).replaceAll("'", '%27');
    response.setHeader('Content-Type', metadata.mimeType);
    response.setHeader('Content-Length', contents.length);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="attachment"; filename*=UTF-8''${encodedName}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('Cache-Control', 'no-store');
    response.send(contents);
  }
}
