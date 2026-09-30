import { afterEach, describe, expect, it } from 'vitest';
import {
  captureWorkerException,
  flushWorkerErrorMonitoring,
  initializeWorkerErrorMonitoring,
} from './error-monitoring.js';

describe('worker error monitoring', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it('is a no-op when SENTRY_DSN is not configured', async () => {
    delete process.env.SENTRY_DSN;

    expect(initializeWorkerErrorMonitoring('test')).toBe(false);
    expect(() => captureWorkerException(new Error('disabled'))).not.toThrow();
    await expect(flushWorkerErrorMonitoring()).resolves.toBeUndefined();
  });
});
