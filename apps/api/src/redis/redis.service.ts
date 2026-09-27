import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { createClient } from 'redis';

function createRecruitOpsRedisClient(redisUrl: string) {
  return createClient({ url: redisUrl });
}

export type RecruitOpsRedisClient = ReturnType<typeof createRecruitOpsRedisClient>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RecruitOpsRedisClient | undefined;
  private connecting: Promise<RecruitOpsRedisClient> | undefined;

  async getClient(): Promise<RecruitOpsRedisClient> {
    if (this.client?.isOpen) return this.client;
    if (this.connecting) return this.connecting;

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      throw new ServiceUnavailableException({
        code: 'REDIS_NOT_CONFIGURED',
        message: 'Redis connection is not configured',
      });
    }

    const client = createRecruitOpsRedisClient(redisUrl);
    client.on('error', () => {
      this.logger.error('Redis client error');
    });

    const connectionPromise = (async () => {
      try {
        await client.connect();
        this.client = client;
        return client;
      } catch {
        throw new ServiceUnavailableException({
          code: 'REDIS_UNAVAILABLE',
          message: 'Redis is unavailable',
        });
      }
    })();

    this.connecting = connectionPromise;
    try {
      return await connectionPromise;
    } finally {
      if (this.connecting === connectionPromise) {
        this.connecting = undefined;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
