import { describe, expect, it, vi } from 'vitest';
import type { SocialPublisher } from '@recruitops/contracts';
import { createProviderTelemetryRegistry } from './provider-telemetry.js';

function createPublisher(overrides: Partial<SocialPublisher> = {}): SocialPublisher {
  return {
    platform: 'FACEBOOK',
    validate: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    publish: vi.fn().mockResolvedValue({ status: 'PUBLISHED', externalPostId: 'post-1' }),
    getStatus: vi.fn().mockResolvedValue({ status: 'PUBLISHED', externalPostId: 'post-1' }),
    ...overrides,
  };
}

function command() {
  return {
    platform: 'FACEBOOK' as const,
    socialAccountId: 'account-1',
    destinationId: 'destination-1',
    idempotencyKey: 'publication:publication-1',
    correlationId: 'request-123',
    payload: { text: 'Hiring', hashtags: [] },
  };
}

describe('provider runtime telemetry', () => {
  it('records provider latency and correlation metadata without payload data', async () => {
    const publisher = createPublisher();
    const logger = { info: vi.fn(), error: vi.fn() };
    const timestamps = [100, 125, 200, 250];
    const registry = createProviderTelemetryRegistry(
      { get: vi.fn().mockReturnValue(publisher) },
      logger,
      () => timestamps.shift() ?? 250,
    );
    const instrumented = registry.get('FACEBOOK');

    await instrumented?.validate(command());
    await instrumented?.publish(command());

    expect(logger.info).toHaveBeenNthCalledWith(1, 'provider_operation', {
      platform: 'FACEBOOK',
      operation: 'validate',
      outcome: 'valid',
      durationMs: 25,
      correlationId: 'request-123',
    });
    expect(logger.info).toHaveBeenNthCalledWith(2, 'provider_operation', {
      platform: 'FACEBOOK',
      operation: 'publish',
      outcome: 'published',
      durationMs: 50,
      correlationId: 'request-123',
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Hiring');
  });

  it('classifies HTTP 429 as rate-limited telemetry and preserves the provider error', async () => {
    const error = Object.assign(new Error('provider throttled'), { status: 429 });
    const publisher = createPublisher({ publish: vi.fn().mockRejectedValue(error) });
    const logger = { info: vi.fn(), error: vi.fn() };
    const timestamps = [10, 42];
    const registry = createProviderTelemetryRegistry(
      { get: vi.fn().mockReturnValue(publisher) },
      logger,
      () => timestamps.shift() ?? 42,
    );

    await expect(registry.get('FACEBOOK')?.publish(command())).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith('provider_operation', {
      platform: 'FACEBOOK',
      operation: 'publish',
      outcome: 'rate_limited',
      durationMs: 32,
      statusCode: 429,
      correlationId: 'request-123',
    });
  });

  it('never lets a telemetry sink failure break provider execution', async () => {
    const publisher = createPublisher();
    const logger = {
      info: vi.fn(() => {
        throw new Error('telemetry unavailable');
      }),
      error: vi.fn(),
    };
    const registry = createProviderTelemetryRegistry(
      { get: vi.fn().mockReturnValue(publisher) },
      logger,
      () => 10,
    );

    await expect(registry.get('FACEBOOK')?.publish(command())).resolves.toMatchObject({
      status: 'PUBLISHED',
    });
  });
});
