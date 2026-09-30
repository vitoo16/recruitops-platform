import { describe, expect, it, vi } from 'vitest';
import type { CommissionsService } from '../commissions/commissions.service.js';
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
  sourcedByActorId: '550e8400-e29b-41d4-a716-446655440013',
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
  it('attributes a new application to the authenticated actor', async () => {
    const repository = {
      createApplication: vi.fn().mockResolvedValue(application),
    } as unknown as CandidatesRepository;
    const commissions = {} as CommissionsService;
    const service = new CandidatesService(repository, commissions);
    const actorId = '550e8400-e29b-41d4-a716-446655440013';
    const input = {
      candidateId: application.candidateId,
      jobId: application.jobId,
    };

    await expect(service.createApplication(input, actorId)).resolves.toEqual(application);
    expect(repository.createApplication).toHaveBeenCalledWith(
      expect.objectContaining(input),
      actorId,
    );
  });

  it('delegates lifecycle transitions to the transactional commission boundary', async () => {
    const updated = { ...application, status: 'INTERVIEW_INVITED' as const };
    const repository = {} as CandidatesRepository;
    const commissions = {
      transitionApplicationStatus: vi.fn().mockResolvedValue(updated),
    } as unknown as CommissionsService;
    const service = new CandidatesService(repository, commissions);
    const occurredAt = '2026-09-28T02:00:00.000Z';

    await expect(
      service.updateApplicationStatus(application.id, {
        status: 'INTERVIEW_INVITED',
        occurredAt,
      }),
    ).resolves.toEqual(updated);
    expect(commissions.transitionApplicationStatus).toHaveBeenCalledWith(application.id, {
      status: 'INTERVIEW_INVITED',
      occurredAt,
    });
  });
});
