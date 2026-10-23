import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestPath = request.path ?? request.url ?? '';
    if (requestPath.startsWith('/api/publico/')) {
      const publicStatus =
        exception instanceof HttpException ? exception.getStatus() : HttpStatus.NOT_FOUND;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Robots-Tag', 'noindex');
      if (publicStatus === HttpStatus.TOO_MANY_REQUESTS) {
        if (!response.hasHeader('Retry-After')) response.setHeader('Retry-After', '60');
        response.status(HttpStatus.TOO_MANY_REQUESTS).json({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Demasiadas consultas. Inténtalo de nuevo más tarde.',
          path: request.path,
        });
      } else {
        response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message:
            'No encontramos un ticket con esos datos. Verifica el número de caso y tu correo.',
          path: request.path,
        });
      }
      return;
    }
    const uploadError =
      typeof exception === 'object' &&
      exception !== null &&
      'name' in exception &&
      exception.name === 'MulterError' &&
      'code' in exception &&
      typeof exception.code === 'string'
        ? exception.code
        : null;
    if (uploadError) {
      const tooLarge = uploadError === 'LIMIT_FILE_SIZE';
      const status = tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      const userId =
        typeof request.user === 'object' &&
        request.user !== null &&
        'id' in request.user &&
        typeof request.user.id === 'string'
          ? request.user.id
          : 'desconocido';
      this.logger.warn(`Anexo rechazado. Usuario: ${userId}; motivo: ${uploadError}.`);
      response.status(status).json({
        statusCode: status,
        message: tooLarge
          ? 'Cada archivo debe pesar como máximo 10 MB.'
          : 'La carga de archivos supera los límites permitidos.',
        path: request.url,
      });
      return;
    }
    const domainStatus =
      exception instanceof Error &&
      'httpStatus' in exception &&
      typeof exception.httpStatus === 'number'
        ? exception.httpStatus
        : null;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : domainStatus ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const internalMessage =
        exception instanceof Error ? exception.message : 'Error interno desconocido.';
      let safeInternalMessage = internalMessage;
      for (const secretName of ['JWT_SECRET', 'SMTP_PASS', 'IMAP_PASS']) {
        const secret = process.env[secretName];
        if (secret) {
          safeInternalMessage = safeInternalMessage.replaceAll(secret, '[REDACTADO]');
        }
      }
      const requestBody = request.body;
      if (typeof requestBody === 'object' && requestBody !== null) {
        for (const [key, value] of Object.entries(requestBody)) {
          if (/(password|pass|secret|token|hash)/i.test(key) && typeof value === 'string') {
            safeInternalMessage = safeInternalMessage.replaceAll(value, '[REDACTADO]');
          }
        }
      }
      const authorization = request.headers?.authorization;
      if (authorization) {
        safeInternalMessage = safeInternalMessage.replaceAll(authorization, '[REDACTADO]');
      }
      safeInternalMessage = safeInternalMessage
        .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTADO]')
        .slice(0, 250);
      this.logger.error(`Error interno: ${safeInternalMessage}`);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor.',
        path: request.url,
      });
      return;
    }

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof exceptionResponse === 'object' &&
            exceptionResponse !== null &&
            'message' in exceptionResponse
          ? exceptionResponse.message
          : status < HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error
            ? exception.message
            : 'Error en la solicitud.';
    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
    });
  }
}
