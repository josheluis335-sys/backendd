import { Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import multer from 'multer';
import type { Request, Response } from 'express';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Observable } from 'rxjs';

@Injectable()
export class AttachmentFilesInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const maxFiles = this.config.get<number>('ANEXOS_MAX_POR_PETICION', 5);
    const parser = multer({
      storage: multer.memoryStorage(),
      preservePath: true,
      limits: { fileSize: 10_485_760, files: maxFiles, fields: 0, parts: maxFiles },
    }).array('archivos', maxFiles);

    await new Promise<void>((resolve, reject) => {
      parser(request, response, (error: unknown) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return next.handle();
  }
}
