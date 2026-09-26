import 'dotenv/config';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { parseApiEnv } from '@recruitops/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const env = parseApiEnv(process.env);
  const logger = new ConsoleLogger({
    json: env.NODE_ENV === 'production',
    prefix: 'RecruitOps',
  });
  const httpLogger = new Logger('HTTP');
  const app = await NestFactory.create(AppModule, { logger });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    const incoming = request.header('x-request-id');
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    const startedAt = Date.now();

    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      httpLogger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  });

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
