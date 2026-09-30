import { Injectable } from '@nestjs/common';
import {
  CommissionTransactionIdSchema,
  CommissionTransactionListQuerySchema,
  type CommissionTransaction,
  type CommissionTransactionListResponse,
} from '@recruitops/contracts';
import { parseRequest } from '../common/zod-request.js';
import { CommissionsRepository } from './commissions.repository.js';

@Injectable()
export class CommissionsService {
  constructor(private readonly commissions: CommissionsRepository) {}

  list(query: unknown): Promise<CommissionTransactionListResponse> {
    return this.commissions.list(parseRequest(CommissionTransactionListQuerySchema, query));
  }

  getById(id: unknown): Promise<CommissionTransaction> {
    return this.commissions.getById(parseRequest(CommissionTransactionIdSchema, id));
  }
}
