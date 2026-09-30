import { createPublicationQueue } from '@recruitops/queue';

export interface PublicationQueueMetrics {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  outstanding: number;
}

export interface PublicationQueueMetricsSource {
  getJobCounts(
    ...types: ('wait' | 'active' | 'delayed' | 'failed')[]
  ): Promise<Record<string, number>>;
}

export interface PublicationQueueMonitorLogger {
  info(event: string, details?: Readonly<Record<string, unknown>>): void;
  error(event: string, details?: Readonly<Record<string, unknown>>): void;
}

export interface PublicationQueueMonitorConfig {
  intervalMs: number;
  waitingAlertThreshold: number;
  failedAlertThreshold: number;
}

export const defaultPublicationQueueMonitorConfig: Readonly<PublicationQueueMonitorConfig> = {
  intervalMs: 60_000,
  waitingAlertThreshold: 100,
  failedAlertThreshold: 1,
};

interface PublicationQueueHandle {
  queue: PublicationQueueMetricsSource;
  close(): Promise<void>;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return parsed;
}

function metricDetails(metrics: PublicationQueueMetrics): Readonly<Record<string, unknown>> {
  return {
    waiting: metrics.waiting,
    active: metrics.active,
    delayed: metrics.delayed,
    failed: metrics.failed,
    outstanding: metrics.outstanding,
  };
}

export function readPublicationQueueMonitorConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PublicationQueueMonitorConfig {
  return {
    intervalMs: positiveInteger(
      env.PUBLICATION_QUEUE_METRICS_INTERVAL_MS,
      defaultPublicationQueueMonitorConfig.intervalMs,
      'PUBLICATION_QUEUE_METRICS_INTERVAL_MS',
    ),
    waitingAlertThreshold: positiveInteger(
      env.PUBLICATION_QUEUE_WAITING_ALERT_THRESHOLD,
      defaultPublicationQueueMonitorConfig.waitingAlertThreshold,
      'PUBLICATION_QUEUE_WAITING_ALERT_THRESHOLD',
    ),
    failedAlertThreshold: positiveInteger(
      env.PUBLICATION_QUEUE_FAILED_ALERT_THRESHOLD,
      defaultPublicationQueueMonitorConfig.failedAlertThreshold,
      'PUBLICATION_QUEUE_FAILED_ALERT_THRESHOLD',
    ),
  };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function samplePublicationQueue(
  source: PublicationQueueMetricsSource,
  logger: PublicationQueueMonitorLogger,
  config: PublicationQueueMonitorConfig = defaultPublicationQueueMonitorConfig,
): Promise<PublicationQueueMetrics> {
  const counts = await source.getJobCounts('wait', 'active', 'delayed', 'failed');
  const metrics: PublicationQueueMetrics = {
    waiting: count(counts.wait),
    active: count(counts.active),
    delayed: count(counts.delayed),
    failed: count(counts.failed),
    outstanding: 0,
  };
  metrics.outstanding = metrics.waiting + metrics.active + metrics.delayed;

  logger.info('publication_queue_metrics', metricDetails(metrics));

  const reasons: string[] = [];
  if (metrics.waiting >= config.waitingAlertThreshold) reasons.push('WAITING_BACKLOG_HIGH');
  if (metrics.failed >= config.failedAlertThreshold) reasons.push('FAILED_JOBS_PRESENT');

  if (reasons.length > 0) {
    logger.error('publication_queue_alert', {
      reasons,
      ...metricDetails(metrics),
      waitingAlertThreshold: config.waitingAlertThreshold,
      failedAlertThreshold: config.failedAlertThreshold,
    });
  }

  return metrics;
}

export function startPublicationQueueMonitor(input: {
  redisUrl: string;
  logger: PublicationQueueMonitorLogger;
  config?: PublicationQueueMonitorConfig;
  openQueue?: (redisUrl: string) => Promise<PublicationQueueHandle>;
}): { close(): Promise<void> } {
  const config = input.config ?? defaultPublicationQueueMonitorConfig;
  const openQueue = input.openQueue ?? createPublicationQueue;
  let handlePromise: Promise<PublicationQueueHandle> | undefined;
  let closed = false;

  const getHandle = () => {
    handlePromise ??= openQueue(input.redisUrl);
    return handlePromise;
  };

  const sample = async () => {
    if (closed) return;
    try {
      const handle = await getHandle();
      await samplePublicationQueue(handle.queue, input.logger, config);
    } catch {
      input.logger.error('publication_queue_monitor_error', {
        code: 'PUBLICATION_QUEUE_METRICS_UNAVAILABLE',
      });
    }
  };

  const timer = setInterval(() => void sample(), config.intervalMs);
  timer.unref?.();

  return {
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      if (!handlePromise) return;
      const handle = await handlePromise.catch(() => undefined);
      await handle?.close();
    },
  };
}
