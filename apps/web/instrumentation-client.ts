import * as Sentry from '@sentry/nextjs';
import { readBrowserErrorMonitoringConfig } from './src/lib/monitoring/browser-error-monitoring';

const monitoring = readBrowserErrorMonitoringConfig();

Sentry.init({
  dsn: monitoring.dsn,
  enabled: monitoring.enabled,
  environment: monitoring.environment,
  sendDefaultPii: false,
  sampleRate: 1,
  tracesSampleRate: 0,
  enableLogs: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
