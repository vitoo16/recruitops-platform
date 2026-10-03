import { Injectable } from '@nestjs/common';
import {
  ApplicationIdSchema,
  ApplicationListQuerySchema,
  CandidateDuplicateSignalQuerySchema,
  CandidateIdSchema,
  CandidateListQuerySchema,
  CreateApplicationSchema,
  CreateCandidateSchema,
  UpdateApplicationStatusSchema,
  UpdateCandidateSchema,
  type Application,
  type ApplicationListResponse,
  type Candidate,
  type CandidateListResponse,
} from '@recruitops/contracts';
import { z } from 'zod';
import { parseRequest } from '../common/zod-request.js';
import { CommissionsService } from '../commissions/commissions.service.js';
import { CandidatesRepository } from './candidates.repository.js';

const SourceUserIdSchema = z.uuid();

@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidates: CandidatesRepository,
    private readonly commissions: CommissionsService,
  ) {}

  async createCandidate(input: unknown): Promise<Candidate> {
    return this.candidates.createCandidate(parseRequest(CreateCandidateSchema, input));
  }

  async listCandidates(query: unknown): Promise<CandidateListResponse> {
    return this.candidates.listCandidates(parseRequest(CandidateListQuerySchema, query));
  }

  async getCandidateById(id: unknown): Promise<Candidate> {
    return this.candidates.getCandidateById(parseRequest(CandidateIdSchema, id));
  }

  async updateCandidate(id: unknown, input: unknown): Promise<Candidate> {
    return this.candidates.updateCandidate(
      parseRequest(CandidateIdSchema, id),
      parseRequest(UpdateCandidateSchema, input),
    );
  }

  async findDuplicateSignals(query: unknown): Promise<Candidate[]> {
    return this.candidates.findDuplicateSignals(
      parseRequest(CandidateDuplicateSignalQuerySchema, query),
    );
  }

  async createApplication(sourceUserId: unknown, input: unknown): Promise<Application> {
    return this.candidates.createApplication(
      parseRequest(CreateApplicationSchema, input),
      parseRequest(SourceUserIdSchema, sourceUserId),
    );
  }

  async listApplications(query: unknown): Promise<ApplicationListResponse> {
    return this.candidates.listApplications(parseRequest(ApplicationListQuerySchema, query));
  }

  async getApplicationById(id: unknown): Promise<Application> {
    return this.candidates.getApplicationById(parseRequest(ApplicationIdSchema, id));
  }

  async updateApplicationStatus(id: unknown, input: unknown): Promise<Application> {
    const applicationId = parseRequest(ApplicationIdSchema, id);
    const update = parseRequest(UpdateApplicationStatusSchema, input);
    return this.commissions.transitionApplicationStatus(
      applicationId,
      update.status,
      update.occurredAt ? new Date(update.occurredAt) : new Date(),
      process.env.COMMISSION_BUSINESS_TIME_ZONE ?? '',
    );
  }
}
