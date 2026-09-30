import { describe, expect, it } from 'vitest';
import { readBrowserErrorMonitoringConfig } from './browser-error-monitoring';

describe('readBrowserErrorMonitoringConfig', () => {
  it('disables browser monitoring when no public DSN is configured', () => {
    expect(readBrowserErrorMonitoringConfig({ NODE_ENV: 'production' })).toEqual({
      dsn: undefined,
      enabled: false,
      environment: 'production',
    });
  });

  it('enables monitoring with a trimmed public DSN', () => {
    expect(
      readBrowserErrorMonitoringConfig({
        NEXT_PUBLIC_SENTRY_DSN: '  https://public@example.ingest.sentry.io/1  ',
        NODE_ENV: 'test',
      }),
    ).toEqual({
      dsn: 'https://public@example.ingest.sentry.io/1',
      enabled: true,
      environment: 'test',
    });
  });

  it('treats empty DSN values as disabled and unknown environments as development', () => {
    expect(
      readBrowserErrorMonitoringConfig({
        NEXT_PUBLIC_SENTRY_DSN: '   ',
        NODE_ENV: 'preview',
      }),
    ).toEqual({
      dsn: undefined,
      enabled: false,
      environment: 'development',
    });
  });
});
