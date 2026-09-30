import * as Sentry from '@sentry/nextjs';
import {
  readBrowserErrorMonitoringConfig,
  sanitizeBrowserErrorEvent,
} from './src/lib/monitoring/browser-error-monitoring';

const monitoring = readBrowserErrorMonitoringConfig();

Sentry.init({
  dsn: monitoring.dsn,
  enabled: monitoring.enabled,
  environment: monitoring.environment,
  sendDefaultPii: false,
  sampleRate: 1,
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

Sentry.setTag('service', 'recruitops-web');
