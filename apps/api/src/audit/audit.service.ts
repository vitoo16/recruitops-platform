import { Injectable, Logger } from '@nestjs/common';
import type { SecurityAuditEvent } from './audit.types.js';

function sanitize(value: string | undefined): string | undefined {
  if (!value) return undefined;

  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 256);
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('SecurityAudit');

  record(event: SecurityAuditEvent): void {
    const entry = {
      eventType: event.eventType,
      outcome: event.outcome,
      occurredAt: new Date().toISOString(),
      requestId: sanitize(event.requestId),
      actorId: sanitize(event.actorId),
      actorRole: sanitize(event.actorRole),
      method: sanitize(event.method),
      path: sanitize(event.path),
      reasonCode: sanitize(event.reasonCode),
    };

    const message = JSON.stringify(entry);

    if (event.outcome === 'SUCCESS') {
      this.logger.log(message);
      return;
    }

    this.logger.warn(message);
  }
}
