import type { Request } from 'express';

export interface RequestWithContext extends Request {
  requestId?: string;
}

export function normalizeIncomingRequestId(input: string | undefined): string | undefined {
  const value = input?.trim();
  if (!value || value.length > 128) return undefined;
  return value;
}
