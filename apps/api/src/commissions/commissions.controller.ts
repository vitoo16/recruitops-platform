import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CommissionsService } from './commissions.service.js';

@Controller('commissions')
@UseGuards(AuthGuard, RolesGuard)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get('transactions')
  @Roles('OWNER', 'ADMIN', 'RECRUITER')
  listTransactions(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commissions.listTransactions(query, request.user!);
  }

  @Get('reconciliation-batches')
  @Roles('OWNER', 'ADMIN')
  listBatches(@Query() query: Record<string, unknown>) {
    return this.commissions.listBatches(query);
  }

  @Post('reconciliation-batches')
  @Roles('OWNER', 'ADMIN')
  createBatch(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.commissions.createReconciliationBatch(body, request.user!.id);
  }

  @Post('reconciliation-batches/:id/mark-paid')
  @Roles('OWNER', 'ADMIN')
  markBatchPaid(@Param('id') id: string) {
    return this.commissions.markBatchPaid(id);
  }
}
