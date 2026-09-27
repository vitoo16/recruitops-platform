import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CandidatesService } from './candidates.service.js';
import type { CandidatesRepository } from './candidates.repository.js';

const application = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  candidateId: '550e8400-e29b-41d4-a716-446655440011',
  jobId: '550e8400-e29b-41d4-a716-446655440012',
  status: 'SUBMITTED' as const,
  sourcePlatform: null,
  sourceDestinationId: null,
  sourceLabel: null,
  sourcedAt: '2026-09-27T08:00:00.000Z',
  submittedAt: '2026-09-27T08:05:00.000Z',
  interviewAt: null,
  hiredAt: null,
  startedAt: null,
  worked30DaysAt: null,
  createdAt: '2026-09-27T08:00:00.000Z',
  updatedAt: '2026-09-27T08:05:00.000Z',
};

describe('CandidatesService', () => {
  it('rejects invalid application status transitions', async () => {
    const repository = {
      getApplicationById: vi.fn().mockResolvedValue(application),
      updateApplicationStatus: vi.fn(),
    } as unknown as CandidatesRepository;
    const service = new CandidatesService(repository);

    await expect(
      service.updateApplicationStatus(application.id, { status: 'WORKING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateApplicationStatus).not.toHaveBeenCalled();
  });

  it('persists a valid transition with the supplied occurrence time', async () => {
    const updated = { ...application, status: 'INTERVIEW_INVITED' as const };
    const repository = {
      getApplicationById: vi.fn().mockResolvedValue(application),
      updateApplicationStatus: vi.fn().mockResolvedValue(updated),
    } as unknown as CandidatesRepository;
    const service = new CandidatesService(repository);
    const occurredAt = '2026-09-28T02:00:00.000Z';

    await expect(
      service.updateApplicationStatus(application.id, {
        status: 'INTERVIEW_INVITED',
        occurredAt,
      }),
    ).resolves.toEqual(updated);
    expect(repository.updateApplicationStatus).toHaveBeenCalledWith(
      application.id,
      'INTERVIEW_INVITED',
      new Date(occurredAt),
    );
  });
});
