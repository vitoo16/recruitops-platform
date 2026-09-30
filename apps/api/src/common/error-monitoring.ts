import * as Sentry from '@sentry/node';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { catchError, throwError } from 'rxjs';
import type { RequestWithContext } from './request-context.js';
import { getSafeRequestPath } from './request-path.js';

let enabled = false;

export function initializeApiErrorMonitoring(nodeEnv: string): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  enabled = Boolean(dsn);
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: nodeEnv,
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        event.request = {
          method: event.request.method,
          url: event.request.url,
        };
      }
      return event;
    },
  });
  Sentry.setTag('service', 'recruitops-api');
  return true;
}

export function captureApiException(error: unknown, request?: RequestWithContext): void {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    scope.setTag('service', 'recruitops-api');
    if (request?.requestId) scope.setTag('request_id', request.requestId);
    if (request) {
      scope.setContext('request', {
        method: request.method,
        path: getSafeRequestPath(request),
      });
    }
    Sentry.captureException(error);
  });
}

export async function flushApiErrorMonitoring(timeoutMs = 2_000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs);
}

@Injectable()
export class ApiErrorMonitoringInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request =
      context.getType() === 'http'
        ? context.switchToHttp().getRequest<RequestWithContext>()
        : undefined;
    return next.handle().pipe(
      catchError((error: unknown) => {
        captureApiException(error, request);
        return throwError(() => error);
      }),
    );
  }
}
