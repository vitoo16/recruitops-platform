import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Job } from '@recruitops/contracts';
import { JobsService } from './jobs.service.js';
import type { JobsRepository } from './jobs.repository.js';

const job: Job = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Frontend Developer',
  companyName: 'Example Company',
  description: 'Build and maintain customer-facing web experiences.',
  location: 'Can Tho',
  employmentType: 'FULL_TIME',
  status: 'DRAFT',
  currency: 'VND',
  salaryMinMinor: 12_000_000,
  salaryMaxMinor: 20_000_000,
  interviewCommissionMinor: null,
  worked30DaysCommissionMinor: null,
  sourceRef: null,
  commissionNote: null,
  createdAt: '2026-09-27T08:00:00.000Z',
  updatedAt: '2026-09-27T08:00:00.000Z',
};

function repositoryMock(): JobsRepository {
  return {
    create: vi.fn(async () => job),
    list: vi.fn(async () => ({ items: [job], page: 1, pageSize: 25, total: 1 })),
    getById: vi.fn(async () => job),
    update: vi.fn(async () => job),
  } as unknown as JobsRepository;
}

describe('JobsService', () => {
  it('normalizes and validates create input before persistence', async () => {
    const repository = repositoryMock();
    const service = new JobsService(repository);

    await service.create({
      title: 'Frontend Developer',
      companyName: 'Example Company',
      description: 'Build and maintain customer-facing web experiences.',
      employmentType: 'FULL_TIME',
      currency: 'vnd',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DRAFT', currency: 'VND' }),
    );
  });

  it('rejects invalid IDs before querying persistence', async () => {
    const repository = repositoryMock();
    const service = new JobsService(repository);

    await expect(service.getById('not-a-uuid')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getById).not.toHaveBeenCalled();
  });

  it('rejects empty updates', async () => {
    const repository = repositoryMock();
    const service = new JobsService(repository);

    await expect(service.update(job.id, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
