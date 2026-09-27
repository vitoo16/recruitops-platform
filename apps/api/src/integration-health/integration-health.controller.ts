import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { IntegrationHealthService } from './integration-health.service.js';

@Controller('integrations/health')
@UseGuards(AuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class IntegrationHealthController {
  constructor(private readonly health: IntegrationHealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth() {
    return this.health.getHealth();
  }
}
