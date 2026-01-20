import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttp) {
      const err = exception as any;
      this.logger.error(
        err?.message ?? 'Unhandled exception',
        err?.stack,
      );
    }

    const resBody = isHttp ? exception.getResponse() : undefined;
    const message =
      typeof resBody === 'string'
        ? resBody
        : (resBody as any)?.message ?? 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message,
      error: isHttp ? (exception as any).name : 'InternalServerError',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

export {};
