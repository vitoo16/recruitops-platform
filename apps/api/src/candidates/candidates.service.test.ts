import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CandidatesService } from './candidates.service.js';
import type { CandidatesRepository } from './candidates.repository.js';
import type { CommissionsService } from '../commissions/commissions.service.js';

const application = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  candidateId: '550e8400-e29b-41d4-a716-446655440011',
  jobId: '550e8400-e29b-41d4-a716-446655440012',
  status: 'SUBMITTED' as const,
  sourcePlatform: null,
  sourceDestinationId: null,
  sourceUserId: '550e8400-e29b-41d4-a716-446655440013',
  sourceLabel: null,
  sourcedAt: '2026-09-27T08:00:00.000Z',
  submittedAt: '2026-09-27T08:05:00.000Z',
  interviewInvitedAt: null,
  interviewAt: null,
  hiredAt: null,
  startedAt: null,
  worked30DaysAt: null,
  createdAt: '2026-09-27T08:00:00.000Z',
  updatedAt: '2026-09-27T08:05:00.000Z',
};

function commissionsMock(): CommissionsService {
  return {
    transitionApplicationStatus: vi.fn(),
  } as unknown as CommissionsService;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CandidatesService', () => {
  it('passes the authenticated principal into application source attribution', async () => {
    const createApplication = vi.fn().mockResolvedValue(application);
    const repository = { createApplication } as unknown as CandidatesRepository;
    const service = new CandidatesService(repository, commissionsMock());
    const input = {
      candidateId: application.candidateId,
      jobId: application.jobId,
      status: 'SUBMITTED',
    };

    await expect(service.createApplication(application.sourceUserId, input)).resolves.toEqual(
      application,
    );
    expect(createApplication).toHaveBeenCalledWith(
      expect.objectContaining(input),
      application.sourceUserId,
    );
  });

  it('propagates fail-closed application transition errors from the atomic commission flow', async () => {
    const commissions = commissionsMock();
    vi.mocked(commissions.transitionApplicationStatus).mockRejectedValue(
      new BadRequestException({
        code: 'INVALID_APPLICATION_STATUS_TRANSITION',
        message: 'Cannot transition application',
      }),
    );
    const service = new CandidatesService({} as CandidatesRepository, commissions);

    await expect(
      service.updateApplicationStatus(application.id, { status: 'WORKING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates a milestone transition with the configured business timezone', async () => {
    vi.stubEnv('COMMISSION_BUSINESS_TIME_ZONE', 'Asia/Ho_Chi_Minh');
    const updated = {
      ...application,
      status: 'INTERVIEW_INVITED' as const,
      interviewInvitedAt: '2026-09-28T02:00:00.000Z',
    };
    const commissions = commissionsMock();
    vi.mocked(commissions.transitionApplicationStatus).mockResolvedValue(updated);
    const service = new CandidatesService({} as CandidatesRepository, commissions);
    const occurredAt = '2026-09-28T02:00:00.000Z';

    await expect(
      service.updateApplicationStatus(application.id, {
        status: 'INTERVIEW_INVITED',
        occurredAt,
      }),
    ).resolves.toEqual(updated);
    expect(commissions.transitionApplicationStatus).toHaveBeenCalledWith(
      application.id,
      'INTERVIEW_INVITED',
      new Date(occurredAt),
      'Asia/Ho_Chi_Minh',
    );
  });
});
