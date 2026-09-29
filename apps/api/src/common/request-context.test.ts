import { describe, expect, it } from 'vitest';
import { normalizeIncomingRequestId } from './request-context.js';

describe('normalizeIncomingRequestId', () => {
  it('trims a bounded request id', () => {
    expect(normalizeIncomingRequestId(' request-123 ')).toBe('request-123');
  });

  it('rejects blank and oversized request ids so the API can generate a UUID', () => {
    expect(normalizeIncomingRequestId('   ')).toBeUndefined();
    expect(normalizeIncomingRequestId('x'.repeat(129))).toBeUndefined();
  });
});
