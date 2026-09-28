import { parsePublicationWorkerEnv } from '@recruitops/config';
import { createPrismaClient } from '@recruitops/database';
import { parseOAuthCredentialKeyring } from '@recruitops/integrations';
import { createPublicationWorkerRuntime } from '@recruitops/queue';
import { PublicationExecutor } from './publication-executor.js';
import {
  PrismaPublicationExecutionRepository,
  createPublicationPublisherFactory,
} from './publication-runtime.js';

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_:-]{1,160}$/.test(code)) return code;
  }
  if (error instanceof Error && /^[A-Z0-9_:-]{1,160}$/.test(error.message)) {
    return error.message;
  }
  return 'WORKER_RUNTIME_ERROR';
}

async function bootstrap(): Promise<void> {
  const env = parsePublicationWorkerEnv(process.env);
  parseOAuthCredentialKeyring(process.env);

  const database = createPrismaClient(env.DATABASE_URL);
  await database.$connect();

  const executor = new PublicationExecutor(
    new PrismaPublicationExecutionRepository(database),
    createPublicationPublisherFactory(env),
  );

  const runtime = await createPublicationWorkerRuntime({
    redisUrl: env.REDIS_URL,
    handler: async (job, execution) => {
      const outcome = await executor.execute(job.publicationId, execution.attemptNumber);
      console.log(
        JSON.stringify({
          level: 'info',
          service: 'recruitops-worker',
          event: 'publication_execution_complete',
          publicationId: job.publicationId,
          attemptNumber: execution.attemptNumber,
          outcome: outcome.status,
        }),
      );
    },
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'recruitops-worker',
        event: 'worker_shutdown_started',
        signal,
      }),
    );
    await runtime.close();
    await database.$disconnect();
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'recruitops-worker',
        event: 'worker_shutdown_complete',
      }),
    );
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').then(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT').then(() => process.exit(0));
  });

  console.log(
    JSON.stringify({
      level: 'info',
      service: 'recruitops-worker',
      event: 'publication_worker_started',
    }),
  );
}

bootstrap().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'recruitops-worker',
      event: 'worker_bootstrap_failed',
      code: safeErrorCode(error),
    }),
  );
  process.exitCode = 1;
});
