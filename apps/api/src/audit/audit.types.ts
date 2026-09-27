export type SecurityAuditEventType =
  'AUTHENTICATION_SUCCESS' | 'AUTHENTICATION_FAILURE' | 'AUTHORIZATION_DENIED';

export type SecurityAuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface SecurityAuditEvent {
  eventType: SecurityAuditEventType;
  outcome: SecurityAuditOutcome;
  requestId?: string;
  actorId?: string;
  actorRole?: string;
  method?: string;
  path?: string;
  reasonCode?: string;
}
