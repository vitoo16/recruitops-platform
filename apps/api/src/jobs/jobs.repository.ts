import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateJobInput,
  Job,
  JobListQuery,
  JobListResponse,
  UpdateJobInput,
} from '@recruitops/contracts';
import type { Job as DatabaseJob } from '@recruitops/database';
import { DatabaseService } from '../database/database.service.js';

function safeMinorAmount(value: bigint | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new InternalServerErrorException({
      code: 'UNSAFE_MONEY_VALUE',
      message: 'Stored monetary value exceeds the API safe-integer range',
    });
  }
  return number;
}

export function mapDatabaseJob(job: DatabaseJob): Job {
  return {
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    description: job.description,
    location: job.location,
    employmentType: job.employmentType,
    status: job.status,
    currency: job.currency,
    salaryMinMinor: safeMinorAmount(job.salaryMinMinor),
    salaryMaxMinor: safeMinorAmount(job.salaryMaxMinor),
    sourceRef: job.sourceRef,
    commissionNote: job.commissionNote,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

@Injectable()
export class JobsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateJobInput): Promise<Job> {
    const job = await this.database.client.job.create({
      data: {
        title: input.title,
        companyName: input.companyName,
        description: input.description,
        employmentType: input.employmentType,
        status: input.status,
        currency: input.currency,
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.salaryMinMinor !== undefined
          ? { salaryMinMinor: BigInt(input.salaryMinMinor) }
          : {}),
        ...(input.salaryMaxMinor !== undefined
          ? { salaryMaxMinor: BigInt(input.salaryMaxMinor) }
          : {}),
        ...(input.sourceRef !== undefined
          ? { sourceRef: input.sourceRef }
          : {}),
        ...(input.commissionNote !== undefined
          ? { commissionNote: input.commissionNote }
          : {}),
      },
    });

    return mapDatabaseJob(job);
  }

  async list(query: JobListQuery): Promise<JobListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                companyName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                location: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.database.client.job.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.database.client.job.count({ where }),
    ]);

    return {
      items: rows.map(mapDatabaseJob),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string): Promise<Job> {
    const job = await this.database.client.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: 'Job was not found',
      });
    }
    return mapDatabaseJob(job);
  }

  async update(id: string, input: UpdateJobInput): Promise<Job> {
    await this.getById(id);

    const job = await this.database.client.job.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.companyName !== undefined
          ? { companyName: input.companyName }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.employmentType !== undefined
          ? { employmentType: input.employmentType }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.salaryMinMinor !== undefined
          ? { salaryMinMinor: BigInt(input.salaryMinMinor) }
          : {}),
        ...(input.salaryMaxMinor !== undefined
          ? { salaryMaxMinor: BigInt(input.salaryMaxMinor) }
          : {}),
        ...(input.sourceRef !== undefined
          ? { sourceRef: input.sourceRef }
          : {}),
        ...(input.commissionNote !== undefined
          ? { commissionNote: input.commissionNote }
          : {}),
      },
    });

    return mapDatabaseJob(job);
  }
}
