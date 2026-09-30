import { describe, expect, it } from 'vitest';
import {
  normalizeBrowserException,
  readBrowserErrorMonitoringConfig,
  sanitizeBrowserErrorEvent,
} from './browser-error-monitoring';

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

describe('sanitizeBrowserErrorEvent', () => {
  it('removes browser context that could carry user or request data', () => {
    const event = {
      user: { id: 'example-user' },
      request: { url: 'https://example.test/private-path' },
      breadcrumbs: [{ category: 'fetch', data: { url: '/candidates' } }],
      contexts: { device: { name: 'example-device' } },
      extra: { detail: 'private-context' },
      transaction: '/candidates',
      exception: { values: [{ type: 'Error', value: 'render failed' }] },
      tags: { service: 'recruitops-web' },
    };

    expect(sanitizeBrowserErrorEvent(event)).toEqual({
      exception: { values: [{ type: 'Error', value: 'render failed' }] },
      tags: { service: 'recruitops-web' },
    });
  });
});

describe('normalizeBrowserException', () => {
  it('preserves Error instances for useful stacks', () => {
    const error = new Error('render failed');
    expect(normalizeBrowserException(error)).toBe(error);
  });

  it('does not serialize arbitrary rejection values into telemetry', () => {
    expect(normalizeBrowserException({ candidateEmail: 'private@example.test' })).toEqual(
      new Error('Unhandled browser exception'),
    );
  });
});
