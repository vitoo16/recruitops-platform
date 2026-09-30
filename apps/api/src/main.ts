import 'dotenv/config';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Response } from 'express';
import { parseApiEnv } from '@recruitops/config';
import { AppModule } from './app.module.js';
import {
  ApiErrorMonitoringInterceptor,
  captureApiException,
  flushApiErrorMonitoring,
  initializeApiErrorMonitoring,
} from './common/error-monitoring.js';
import { normalizeIncomingRequestId, type RequestWithContext } from './common/request-context.js';
import { getSafeRequestPath } from './common/request-path.js';

async function bootstrap() {
  const env = parseApiEnv(process.env);
  initializeApiErrorMonitoring(env.NODE_ENV);
  const logger = new ConsoleLogger({
    json: env.NODE_ENV === 'production',
    prefix: 'RecruitOps',
  });
  const httpLogger = new Logger('HTTP');
  const app = await NestFactory.create(AppModule, { logger });

  app.useSecurityHeaders();
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: false,
  });
  app.useGlobalInterceptors(new ApiErrorMonitoringInterceptor());

  app.use((request: RequestWithContext, response: Response, next: NextFunction) => {
    const requestId = normalizeIncomingRequestId(request.header('x-request-id')) ?? randomUUID();
    const startedAt = Date.now();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      httpLogger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: getSafeRequestPath(request),
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  });

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap().catch(async (error: unknown) => {
  captureApiException(error);
  await flushApiErrorMonitoring();
  process.exitCode = 1;
});
