import type {
  PublicationStatus,
  PublishCommand,
  PublishResult,
  SocialPlatform,
  SocialPublisher,
  ValidationResult,
} from '@recruitops/contracts';
import type { SocialPublisherRegistry } from '@recruitops/queue';

export interface ProviderTelemetryLogger {
  info(event: string, details?: Readonly<Record<string, unknown>>): void;
  error(event: string, details?: Readonly<Record<string, unknown>>): void;
}

type ProviderOperation = 'validate' | 'publish' | 'get_status';

function providerHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

function safeEmit(
  logger: ProviderTelemetryLogger,
  level: 'info' | 'error',
  details: Readonly<Record<string, unknown>>,
): void {
  try {
    logger[level]('provider_operation', details);
  } catch {
    // Telemetry must never change provider execution semantics.
  }
}

class TelemetrySocialPublisher implements SocialPublisher {
  readonly platform: SocialPlatform;

  constructor(
    private readonly publisher: SocialPublisher,
    private readonly logger: ProviderTelemetryLogger,
    private readonly nowMs: () => number,
  ) {
    this.platform = publisher.platform;
  }

  async validate(command: PublishCommand): Promise<ValidationResult> {
    const startedAt = this.nowMs();
    try {
      const result = await this.publisher.validate(command);
      this.emitSuccess(
        'validate',
        startedAt,
        command.correlationId,
        result.valid ? 'valid' : 'invalid',
      );
      return result;
    } catch (error) {
      this.emitError('validate', startedAt, error, command.correlationId);
      throw error;
    }
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    const startedAt = this.nowMs();
    try {
      const result = await this.publisher.publish(command);
      this.emitSuccess('publish', startedAt, command.correlationId, result.status.toLowerCase());
      return result;
    } catch (error) {
      this.emitError('publish', startedAt, error, command.correlationId);
      throw error;
    }
  }

  async getStatus(externalPostId: string): Promise<PublicationStatus> {
    const startedAt = this.nowMs();
    try {
      const result = await this.publisher.getStatus(externalPostId);
      this.emitSuccess('get_status', startedAt, undefined, result.status.toLowerCase());
      return result;
    } catch (error) {
      this.emitError('get_status', startedAt, error);
      throw error;
    }
  }

  private emitSuccess(
    operation: ProviderOperation,
    startedAt: number,
    correlationId: string | undefined,
    outcome: string,
  ): void {
    safeEmit(this.logger, 'info', {
      platform: this.platform,
      operation,
      outcome,
      durationMs: Math.max(0, this.nowMs() - startedAt),
      ...(correlationId ? { correlationId } : {}),
    });
  }

  private emitError(
    operation: ProviderOperation,
    startedAt: number,
    error: unknown,
    correlationId?: string,
  ): void {
    const statusCode = providerHttpStatus(error);
    safeEmit(this.logger, 'error', {
      platform: this.platform,
      operation,
      outcome: statusCode === 429 ? 'rate_limited' : 'error',
      durationMs: Math.max(0, this.nowMs() - startedAt),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(correlationId ? { correlationId } : {}),
    });
  }
}

export function createProviderTelemetryRegistry(
  publishers: SocialPublisherRegistry,
  logger: ProviderTelemetryLogger,
  nowMs: () => number = Date.now,
): SocialPublisherRegistry {
  const cache = new Map<SocialPlatform, SocialPublisher>();

  return {
    get(platform) {
      const cached = cache.get(platform);
      if (cached) return cached;

      const publisher = publishers.get(platform);
      if (!publisher) return undefined;

      const wrapped = new TelemetrySocialPublisher(publisher, logger, nowMs);
      cache.set(platform, wrapped);
      return wrapped;
    },
  };
}
