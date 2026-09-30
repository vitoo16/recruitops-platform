export interface BrowserErrorMonitoringConfig {
  dsn: string | undefined;
  enabled: boolean;
  environment: 'development' | 'test' | 'production';
}

type PublicMonitoringEnv = Readonly<{
  NEXT_PUBLIC_SENTRY_DSN?: string;
  NODE_ENV?: string;
}>;

type SanitizableBrowserErrorEvent = {
  user?: unknown;
  request?: unknown;
  breadcrumbs?: unknown;
  contexts?: unknown;
  extra?: unknown;
  transaction?: unknown;
};

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

export function sanitizeBrowserErrorEvent<T extends SanitizableBrowserErrorEvent>(event: T): T {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.extra;
  delete event.transaction;
  return event;
}
