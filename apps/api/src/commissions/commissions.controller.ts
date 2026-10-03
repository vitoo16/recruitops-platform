import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CommissionsService } from './commissions.service.js';

@Controller('commissions')
@UseGuards(AuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.commissions.list(query);
  }

  @Get('reconciliation-batches')
  listReconciliationBatches(@Query() query: Record<string, unknown>) {
    return this.commissions.listReconciliationBatches(query);
  }

  @Get('reconciliation-batches/:id/export.csv')
  async exportReconciliationBatchCsv(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.commissions.exportReconciliationBatchCsv(id);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    return exported.csv;
  }

  @Get('reconciliation-batches/:id')
  getReconciliationBatchById(@Param('id') id: string) {
    return this.commissions.getReconciliationBatchById(id);
  }

  @Post('reconciliation-batches')
  createReconciliationBatch(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.commissions.createReconciliationBatch(request.user?.id, body);
  }

  @Post('reconciliation-batches/:id/mark-paid')
  markReconciliationBatchPaid(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.commissions.markReconciliationBatchPaid(request.user?.id, id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.commissions.getById(id);
  }
}
