import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@recruitops/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private prisma: PrismaClient | undefined;

  get client(): PrismaClient {
    if (!this.prisma) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new ServiceUnavailableException({
          code: 'DATABASE_NOT_CONFIGURED',
          message: 'Database connection is not configured',
        });
      }

      this.prisma = createPrismaClient(connectionString);
    }

    return this.prisma;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }
}
