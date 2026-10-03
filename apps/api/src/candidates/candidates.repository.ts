import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Application,
  ApplicationListQuery,
  ApplicationListResponse,
  ApplicationStatus,
  Candidate,
  CandidateDuplicateSignalQuery,
  CandidateListQuery,
  CandidateListResponse,
  CreateApplicationInput,
  CreateCandidateInput,
  UpdateCandidateInput,
} from '@recruitops/contracts';
import { normalizeCandidateEmail, normalizeCandidatePhone } from '@recruitops/contracts';
import type {
  Application as DatabaseApplication,
  Candidate as DatabaseCandidate,
} from '@recruitops/database';
import { DatabaseService } from '../database/database.service.js';

export function mapDatabaseCandidate(candidate: DatabaseCandidate): Candidate {
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export function mapDatabaseApplication(application: DatabaseApplication): Application {
  return {
    id: application.id,
    candidateId: application.candidateId,
    jobId: application.jobId,
    status: application.status,
    sourcePlatform: application.sourcePlatform,
    sourceDestinationId: application.sourceDestinationId,
    sourceUserId: application.sourceUserId,
    sourceLabel: application.sourceLabel,
    sourcedAt: application.sourcedAt.toISOString(),
    submittedAt: application.submittedAt?.toISOString() ?? null,
    interviewInvitedAt: application.interviewInvitedAt?.toISOString() ?? null,
    interviewAt: application.interviewAt?.toISOString() ?? null,
    hiredAt: application.hiredAt?.toISOString() ?? null,
    startedAt: application.startedAt?.toISOString() ?? null,
    worked30DaysAt: application.worked30DaysAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

export function milestoneForStatus(
  status: ApplicationStatus,
  occurredAt: Date,
): Record<string, Date> {
  switch (status) {
    case 'SUBMITTED':
      return { submittedAt: occurredAt };
    case 'INTERVIEW_INVITED':
      return { interviewInvitedAt: occurredAt };
    case 'INTERVIEWED':
      return { interviewAt: occurredAt };
    case 'HIRED':
      return { hiredAt: occurredAt };
    case 'WORKING':
      return { startedAt: occurredAt };
    case 'WORKED_30_DAYS':
      return { worked30DaysAt: occurredAt };
    default:
      return {};
  }
}

@Injectable()
export class CandidatesRepository {
  constructor(private readonly database: DatabaseService) {}

  async createCandidate(input: CreateCandidateInput): Promise<Candidate> {
    const candidate = await this.database.client.candidate.create({
      data: {
        fullName: input.fullName,
        ...(input.email !== undefined
          ? {
              email: input.email,
              emailNormalized: normalizeCandidateEmail(input.email),
            }
          : {}),
        ...(input.phone !== undefined
          ? {
              phone: input.phone,
              phoneNormalized: normalizeCandidatePhone(input.phone),
            }
          : {}),
      },
    });

    return mapDatabaseCandidate(candidate);
  }

  async listCandidates(query: CandidateListQuery): Promise<CandidateListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.database.client.candidate.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.database.client.candidate.count({ where }),
    ]);

    return {
      items: rows.map(mapDatabaseCandidate),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getCandidateById(id: string): Promise<Candidate> {
    const candidate = await this.database.client.candidate.findUnique({ where: { id } });
    if (!candidate) {
      throw new NotFoundException({
        code: 'CANDIDATE_NOT_FOUND',
        message: 'Candidate was not found',
      });
    }
    return mapDatabaseCandidate(candidate);
  }

  async updateCandidate(id: string, input: UpdateCandidateInput): Promise<Candidate> {
    await this.getCandidateById(id);

    const candidate = await this.database.client.candidate.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined
          ? {
              email: input.email,
              emailNormalized: input.email ? normalizeCandidateEmail(input.email) : null,
            }
          : {}),
        ...(input.phone !== undefined
          ? {
              phone: input.phone,
              phoneNormalized: input.phone ? normalizeCandidatePhone(input.phone) : null,
            }
          : {}),
      },
    });

    return mapDatabaseCandidate(candidate);
  }

  async findDuplicateSignals(query: CandidateDuplicateSignalQuery): Promise<Candidate[]> {
    const clauses = [
      ...(query.email ? [{ emailNormalized: normalizeCandidateEmail(query.email) }] : []),
      ...(query.phone ? [{ phoneNormalized: normalizeCandidatePhone(query.phone) }] : []),
    ];

    if (clauses.length === 0) return [];

    const candidates = await this.database.client.candidate.findMany({
      where: { OR: clauses },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });

    return candidates.map(mapDatabaseCandidate);
  }

  async createApplication(
    input: CreateApplicationInput,
    sourceUserId: string,
  ): Promise<Application> {
    const [candidate, job, destination] = await Promise.all([
      this.database.client.candidate.findUnique({
        where: { id: input.candidateId },
        select: { id: true },
      }),
      this.database.client.job.findUnique({
        where: { id: input.jobId },
        select: { id: true },
      }),
      input.sourceDestinationId
        ? this.database.client.destination.findUnique({
            where: { id: input.sourceDestinationId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!candidate) {
      throw new NotFoundException({
        code: 'CANDIDATE_NOT_FOUND',
        message: 'Candidate was not found',
      });
    }
    if (!job) {
      throw new NotFoundException({ code: 'JOB_NOT_FOUND', message: 'Job was not found' });
    }
    if (input.sourceDestinationId && !destination) {
      throw new NotFoundException({
        code: 'DESTINATION_NOT_FOUND',
        message: 'Source destination was not found',
      });
    }

    const application = await this.database.client.application.create({
      data: {
        candidateId: input.candidateId,
        jobId: input.jobId,
        status: input.status,
        sourceUserId,
        ...(input.sourcePlatform !== undefined ? { sourcePlatform: input.sourcePlatform } : {}),
        ...(input.sourceDestinationId !== undefined
          ? { sourceDestinationId: input.sourceDestinationId }
          : {}),
        ...(input.sourceLabel !== undefined ? { sourceLabel: input.sourceLabel } : {}),
      },
    });

    return mapDatabaseApplication(application);
  }

  async listApplications(query: ApplicationListQuery): Promise<ApplicationListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.database.client.application.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.database.client.application.count({ where }),
    ]);

    return {
      items: rows.map(mapDatabaseApplication),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getApplicationById(id: string): Promise<Application> {
    const application = await this.database.client.application.findUnique({ where: { id } });
    if (!application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application was not found',
      });
    }
    return mapDatabaseApplication(application);
  }

  async updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    occurredAt: Date,
  ): Promise<Application> {
    const application = await this.database.client.application.update({
      where: { id },
      data: {
        status,
        ...milestoneForStatus(status, occurredAt),
      },
    });

    return mapDatabaseApplication(application);
  }
}
