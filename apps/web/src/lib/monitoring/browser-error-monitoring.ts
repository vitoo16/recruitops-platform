export interface BrowserErrorMonitoringConfig {
  dsn: string | undefined;
  enabled: boolean;
  environment: 'development' | 'test' | 'production';
}

type PublicMonitoringEnv = Readonly<{
  NEXT_PUBLIC_SENTRY_DSN?: string | undefined;
  NODE_ENV?: string | undefined;
}>;

type SanitizableBrowserErrorEvent = {
  user?: unknown;
  request?: unknown;
  breadcrumbs?: unknown;
  contexts?: unknown;
  extra?: unknown;
  transaction?: unknown;
};

type BrowserSentryModule = typeof import('@sentry/browser');

let sentryModulePromise: Promise<BrowserSentryModule | null> | undefined;

function normalizeDsn(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEnvironment(
  value: string | undefined,
): BrowserErrorMonitoringConfig['environment'] {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

export function readBrowserErrorMonitoringConfig(
  env: PublicMonitoringEnv = process.env,
): BrowserErrorMonitoringConfig {
  const dsn = normalizeDsn(env.NEXT_PUBLIC_SENTRY_DSN);

  return {
    dsn,
    enabled: dsn !== undefined,
    environment: normalizeEnvironment(env.NODE_ENV),
  };
}

export function readBrowserErrorMonitoringBuildConfig(): BrowserErrorMonitoringConfig {
  return readBrowserErrorMonitoringConfig({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NODE_ENV: process.env.NODE_ENV,
  });
}

export function sanitizeBrowserErrorEvent<T extends SanitizableBrowserErrorEvent>(event: T): T {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.extra;
  delete event.transaction;
  return event;
}

export function normalizeBrowserException(value: unknown): Error {
  return value instanceof Error ? value : new Error('Unhandled browser exception');
}

export function initializeBrowserErrorMonitoring(): Promise<BrowserSentryModule | null> {
  const monitoring = readBrowserErrorMonitoringBuildConfig();
  if (!monitoring.enabled) return Promise.resolve(null);

  sentryModulePromise ??= import('@sentry/browser')
    .then((sentry) => {
      sentry.init({
        dsn: monitoring.dsn,
        environment: monitoring.environment,
        sampleRate: 1,
        defaultIntegrations: false,
        tracesSampleRate: 0,
        enableLogs: false,
        maxBreadcrumbs: 0,
        beforeBreadcrumb() {
          return null;
        },
        beforeSend(event) {
          return sanitizeBrowserErrorEvent(event);
        },
      });
      sentry.setTag('service', 'recruitops-web');
      return sentry;
    })
    .catch(() => null);

  return sentryModulePromise;
}

export async function captureBrowserException(value: unknown): Promise<void> {
  const sentry = await initializeBrowserErrorMonitoring();
  if (!sentry) return;
  sentry.captureException(normalizeBrowserException(value));
}
