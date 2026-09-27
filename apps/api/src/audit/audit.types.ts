export type SecurityAuditEventType =
  'AUTHENTICATION_SUCCESS' | 'AUTHENTICATION_FAILURE' | 'AUTHORIZATION_DENIED';

export type SecurityAuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface SecurityAuditEvent {
  eventType: SecurityAuditEventType;
  outcome: SecurityAuditOutcome;
  requestId?: string | undefined;
  actorId?: string | undefined;
  actorRole?: string | undefined;
  method?: string | undefined;
  path?: string | undefined;
  reasonCode?: string | undefined;
}
