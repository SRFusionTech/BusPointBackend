import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { errorResponse } from '../response/api-response';
import { t } from '../../i18n/translate';
import { I18nKey } from '../../i18n/i18n.keys';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = t(I18nKey.COMMON.INTERNAL_ERROR);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      // NestJS validation errors return { message: string[] }
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const raw = (body as { message: string | string[] }).message;
        message = Array.isArray(raw) ? raw[0] : raw;
      } else if (typeof body === 'string') {
        message = body;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof QueryFailedError && (exception.driverError as { code?: string })?.code === '23505') {
      // Unique constraint hit that a service didn't pre-check — a conflict, not a server fault
      status = HttpStatus.CONFLICT;
      message = t(I18nKey.COMMON.DUPLICATE);
      this.logger.error(`Unique violation: ${exception.message}`);
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
    }

    this.logger.warn(`${req.method} ${req.url} → ${status}: ${message}`);

    res.status(status).json(errorResponse(message));
  }
}
