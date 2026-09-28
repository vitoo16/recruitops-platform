import {
  readWorkerRuntimeConfig,
  startPublicationWorkerRuntime,
  WorkerRuntimeConfigurationError,
} from './runtime.js';

function startupErrorCode(error: unknown): string {
  if (error instanceof WorkerRuntimeConfigurationError) return error.code;
  return 'PUBLICATION_WORKER_STARTUP_FAILED';
}

async function main(): Promise<void> {
  let runtime: ReturnType<typeof startPublicationWorkerRuntime>;
  try {
    runtime = startPublicationWorkerRuntime(readWorkerRuntimeConfig());
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'recruitops-worker',
        event: 'publication_worker_startup_failed',
        code: startupErrorCode(error),
      }),
    );
    process.exitCode = 1;
    return;
  }

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'recruitops-worker',
        event: 'publication_worker_shutdown_requested',
        signal,
      }),
    );
    try {
      await runtime.close();
    } catch {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'recruitops-worker',
          event: 'publication_worker_shutdown_failed',
        }),
      );
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

void main();
