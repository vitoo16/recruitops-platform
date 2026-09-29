import type { PublishCommand, PublicationState, SocialPublisher } from '@recruitops/contracts';
import {
  createPublicationQueue,
  createPublicationWorker,
  enqueuePublication,
  type PublicationExecutionPatch,
  type PublicationExecutionRecord,
  type PublicationExecutionRepository,
  type SocialPublisherRegistry,
} from '@recruitops/queue';
import { describe, expect, it, vi } from 'vitest';
import { createPublicationJobHandler } from './publication-handler.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL_REQUIRED_FOR_PUBLICATION_INTEGRATION_TEST');

const destinationId = '22222222-2222-4222-8222-222222222222';
const socialAccountId = '11111111-1111-4111-8111-111111111111';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(
  currentState: () => PublicationState,
  expected: PublicationState,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (currentState() === expected) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for publication state ${expected}; received ${currentState()}`);
}

function createMutableRepository(publicationId: string, initialState: PublicationState) {
  let state = initialState;
  let retryCount = 0;
  const patches: PublicationExecutionPatch[] = [];

  const repository: PublicationExecutionRepository = {
    async loadForExecution(candidateId): Promise<PublicationExecutionRecord | null> {
      if (candidateId !== publicationId) return null;
      return {
        id: publicationId,
        state,
        retryCount,
        idempotencyKey: `publication:${publicationId}`,
        platform: 'FACEBOOK',
        destination: {
          id: destinationId,
          platform: 'FACEBOOK',
          postingMode: 'API',
          enabled: true,
          socialAccountId,
        },
        socialAccount: {
          id: socialAccountId,
          platform: 'FACEBOOK',
          status: 'CONNECTED',
        },
        payload: {
          text: 'RecruitOps integration publication',
          hashtags: ['recruitops'],
        },
      };
    },
    async compareAndSet(candidateId, expectedStates, patch): Promise<boolean> {
      if (candidateId !== publicationId || !expectedStates.includes(state)) return false;
      patches.push(patch);
      state = patch.state;
      if (patch.retryCount !== undefined) retryCount = patch.retryCount;
      return true;
    },
  };

  return {
    repository,
    getState: () => state,
    patches,
  };
}

function createPublisher() {
  const publish = vi.fn(async (_command: PublishCommand) => ({
    status: 'PUBLISHED' as const,
    externalPostId: 'provider-post-1',
    externalUrl: 'https://provider.example/posts/provider-post-1',
    providerRequestId: 'provider-request-1',
  }));

  const publisher: SocialPublisher = {
    platform: 'FACEBOOK',
    async validate() {
      return { valid: true, issues: [] };
    },
    publish,
    async getStatus() {
      return { status: 'PUBLISHED', externalPostId: 'provider-post-1' };
    },
  };

  const registry: SocialPublisherRegistry = {
    get(platform) {
      return platform === 'FACEBOOK' ? publisher : undefined;
    },
  };

  return { publish, registry };
}

function redisConnectionOptions(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || '6379'),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
  };
}

async function createRuntime(publicationId: string, initialState: PublicationState) {
  const queueRuntime = await createPublicationQueue(redisUrl);
  await queueRuntime.queue.obliterate({ force: true });

  const repositoryState = createMutableRepository(publicationId, initialState);
  const publisher = createPublisher();
  const handler = createPublicationJobHandler(repositoryState.repository, publisher.registry);
  const worker = createPublicationWorker({
    connection: redisConnectionOptions(redisUrl),
    handler,
    limits: { concurrency: 1, maxPerDuration: 20, durationMs: 1_000 },
  });
  await worker.waitUntilReady();

  return {
    queueRuntime,
    worker,
    ...repositoryState,
    ...publisher,
    async close() {
      await worker.close();
      await queueRuntime.queue.obliterate({ force: true });
      await queueRuntime.close();
    },
  };
}

describe('publication pipeline integration', () => {
  it('executes an immediate publication once and suppresses a duplicate Publication UUID', async () => {
    const publicationId = '33333333-3333-4333-8333-333333333333';
    const runtime = await createRuntime(publicationId, 'PENDING');

    try {
      const scheduledAt = new Date();
      await enqueuePublication(runtime.queueRuntime.queue, { publicationId, scheduledAt });
      await waitForState(runtime.getState, 'PUBLISHED');

      expect(runtime.publish).toHaveBeenCalledTimes(1);
      expect(runtime.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'FACEBOOK',
          destinationId,
          socialAccountId,
          idempotencyKey: `publication:${publicationId}`,
        }),
      );
      expect(runtime.patches.map((patch) => patch.state)).toEqual(['PUBLISHING', 'PUBLISHED']);

      await enqueuePublication(runtime.queueRuntime.queue, { publicationId, scheduledAt });
      await delay(250);

      expect(runtime.publish).toHaveBeenCalledTimes(1);
      const retainedJob = await runtime.queueRuntime.queue.getJob(publicationId);
      expect(retainedJob).not.toBeUndefined();
      await expect(retainedJob!.getState()).resolves.toBe('completed');
    } finally {
      await runtime.close();
    }
  });

  it('keeps a scheduled publication delayed until its due time before executing it', async () => {
    const publicationId = '44444444-4444-4444-8444-444444444444';
    const runtime = await createRuntime(publicationId, 'SCHEDULED');

    try {
      const now = new Date();
      const scheduledAt = new Date(now.getTime() + 750);
      await enqueuePublication(
        runtime.queueRuntime.queue,
        { publicationId, scheduledAt },
        now.getTime(),
      );

      const queuedJob = await runtime.queueRuntime.queue.getJob(publicationId);
      expect(queuedJob).not.toBeUndefined();
      expect(queuedJob!.data.scheduledAt).toBe(scheduledAt.toISOString());
      await expect(queuedJob!.getState()).resolves.toBe('delayed');

      await delay(200);
      expect(runtime.publish).not.toHaveBeenCalled();

      await waitForState(runtime.getState, 'PUBLISHED');
      expect(runtime.publish).toHaveBeenCalledTimes(1);
      expect(runtime.patches.map((patch) => patch.state)).toEqual(['PUBLISHING', 'PUBLISHED']);
    } finally {
      await runtime.close();
    }
  });
});
