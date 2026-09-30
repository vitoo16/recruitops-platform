import { captureException, init, setTag } from '@sentry/browser';
import {
  readBrowserErrorMonitoringConfig,
  sanitizeBrowserErrorEvent,
} from './src/lib/monitoring/browser-error-monitoring';

const monitoring = readBrowserErrorMonitoringConfig();

if (monitoring.enabled) {
  init({
    dsn: monitoring.dsn,
    environment: monitoring.environment,
    sendDefaultPii: false,
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

  setTag('service', 'recruitops-web');

  window.addEventListener('error', (event) => {
    if (event.error instanceof Error) {
      captureException(event.error);
      return;
    }

    if (event.message) {
      captureException(new Error(event.message));
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof Error) {
      captureException(event.reason);
      return;
    }

    captureException(new Error('Unhandled promise rejection'));
  });
}
