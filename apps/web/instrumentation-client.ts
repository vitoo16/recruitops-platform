import {
  captureBrowserException,
  initializeBrowserErrorMonitoring,
  readBrowserErrorMonitoringBuildConfig,
} from './src/lib/monitoring/browser-error-monitoring';

const monitoring = readBrowserErrorMonitoringBuildConfig();

if (monitoring.enabled) {
  window.addEventListener('error', (event) => {
    void captureBrowserException(event.error ?? new Error(event.message || 'Browser error'));
  });

  window.addEventListener('unhandledrejection', (event) => {
    void captureBrowserException(event.reason);
  });

  void initializeBrowserErrorMonitoring();
}
