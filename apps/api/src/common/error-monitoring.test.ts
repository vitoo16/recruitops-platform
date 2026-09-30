import { afterEach, describe, expect, it } from 'vitest';
import {
  captureApiException,
  flushApiErrorMonitoring,
  initializeApiErrorMonitoring,
} from './error-monitoring.js';

describe('API error monitoring', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it('is a no-op when SENTRY_DSN is not configured', async () => {
    delete process.env.SENTRY_DSN;

    expect(initializeApiErrorMonitoring('test')).toBe(false);
    expect(() => captureApiException(new Error('disabled'))).not.toThrow();
    await expect(flushApiErrorMonitoring()).resolves.toBeUndefined();
  });
});
