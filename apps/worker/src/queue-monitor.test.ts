import { describe, expect, it, vi } from 'vitest';
import {
  defaultPublicationQueueMonitorConfig,
  readPublicationQueueMonitorConfig,
  samplePublicationQueue,
  startPublicationQueueMonitor,
} from './queue-monitor.js';

describe('publication queue monitoring', () => {
  it('reads defaults and validates explicit thresholds', () => {
    expect(readPublicationQueueMonitorConfig({})).toEqual(defaultPublicationQueueMonitorConfig);
    expect(
      readPublicationQueueMonitorConfig({
        PUBLICATION_QUEUE_METRICS_INTERVAL_MS: '5000',
        PUBLICATION_QUEUE_WAITING_ALERT_THRESHOLD: '25',
        PUBLICATION_QUEUE_FAILED_ALERT_THRESHOLD: '2',
      }),
    ).toEqual({
      intervalMs: 5_000,
      waitingAlertThreshold: 25,
      failedAlertThreshold: 2,
    });
    expect(() =>
      readPublicationQueueMonitorConfig({ PUBLICATION_QUEUE_FAILED_ALERT_THRESHOLD: '0' }),
    ).toThrow('PUBLICATION_QUEUE_FAILED_ALERT_THRESHOLD must be a positive integer');
  });

  it('emits bounded queue counts and alerts when configured thresholds are reached', async () => {
    const source = {
      getJobCounts: vi.fn().mockResolvedValue({ wait: 12, active: 2, delayed: 4, failed: 1 }),
    };
    const logger = { info: vi.fn(), error: vi.fn() };

    await expect(
      samplePublicationQueue(source, logger, {
        intervalMs: 60_000,
        waitingAlertThreshold: 10,
        failedAlertThreshold: 1,
      }),
    ).resolves.toEqual({
      waiting: 12,
      active: 2,
      delayed: 4,
      failed: 1,
      outstanding: 18,
    });

    expect(source.getJobCounts).toHaveBeenCalledWith('wait', 'active', 'delayed', 'failed');
    expect(logger.info).toHaveBeenCalledWith('publication_queue_metrics', {
      waiting: 12,
      active: 2,
      delayed: 4,
      failed: 1,
      outstanding: 18,
    });
    expect(logger.error).toHaveBeenCalledWith('publication_queue_alert', {
      reasons: ['WAITING_BACKLOG_HIGH', 'FAILED_JOBS_PRESENT'],
      waiting: 12,
      active: 2,
      delayed: 4,
      failed: 1,
      outstanding: 18,
      waitingAlertThreshold: 10,
      failedAlertThreshold: 1,
    });
  });

  it('does not open an observer Redis connection until the first scheduled sample', async () => {
    vi.useFakeTimers();
    try {
      const close = vi.fn().mockResolvedValue(undefined);
      const openQueue = vi.fn().mockResolvedValue({
        queue: { getJobCounts: vi.fn().mockResolvedValue({}) },
        close,
      });
      const logger = { info: vi.fn(), error: vi.fn() };
      const monitor = startPublicationQueueMonitor({
        redisUrl: 'redis://localhost:6379',
        logger,
        config: {
          intervalMs: 1_000,
          waitingAlertThreshold: 100,
          failedAlertThreshold: 1,
        },
        openQueue,
      });

      expect(openQueue).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(openQueue).toHaveBeenCalledOnce();

      await monitor.close();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
