import * as Sentry from '@sentry/node';

let enabled = false;

export function initializeWorkerErrorMonitoring(nodeEnv: string): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  enabled = Boolean(dsn);
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: nodeEnv,
    beforeSend(event) {
      delete event.user;
      delete event.request;
      return event;
    },
  });
  Sentry.setTag('service', 'recruitops-worker');
  return true;
}

export function captureWorkerException(error: unknown, context?: Record<string, string>): void {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    scope.setTag('service', 'recruitops-worker');
    for (const [key, value] of Object.entries(context ?? {})) scope.setTag(key, value);
    Sentry.captureException(error);
  });
}

export async function flushWorkerErrorMonitoring(timeoutMs = 2_000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs);
}

export function registerWorkerProcessErrorMonitoring(): void {
  process.on('unhandledRejection', (reason) => {
    captureWorkerException(reason, { event: 'unhandled_rejection' });
  });

  process.on('uncaughtExceptionMonitor', (error) => {
    captureWorkerException(error, { event: 'uncaught_exception' });
  });
}
