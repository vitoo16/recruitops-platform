import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@recruitops/contracts';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'recruitops-api',
      timestamp: new Date().toISOString(),
    };
  }
}
