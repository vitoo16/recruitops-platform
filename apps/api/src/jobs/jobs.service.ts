import { Injectable } from '@nestjs/common';
import {
  CreateJobSchema,
  JobIdSchema,
  JobListQuerySchema,
  UpdateJobSchema,
  type Job,
  type JobListResponse,
} from '@recruitops/contracts';
import { parseRequest } from '../common/zod-request.js';
import { JobsRepository } from './jobs.repository.js';

@Injectable()
export class JobsService {
  constructor(private readonly jobs: JobsRepository) {}

  async create(input: unknown): Promise<Job> {
    return this.jobs.create(parseRequest(CreateJobSchema, input));
  }

  async list(query: unknown): Promise<JobListResponse> {
    return this.jobs.list(parseRequest(JobListQuerySchema, query));
  }

  async getById(id: unknown): Promise<Job> {
    return this.jobs.getById(parseRequest(JobIdSchema, id));
  }

  async update(id: unknown, input: unknown): Promise<Job> {
    const jobId = parseRequest(JobIdSchema, id);
    return this.jobs.update(jobId, parseRequest(UpdateJobSchema, input));
  }
}
