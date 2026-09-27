import { describe, expect, it } from 'vitest';
import {
  buildPrivateObjectKey,
  objectKeyBelongsToUser,
  validatePrivateFileUpload,
  type PrivateFileUploadIntent,
} from './files.js';

const intent: PrivateFileUploadIntent = {
  purpose: 'CANDIDATE_CV',
  ownerUserId: '9a3975ad-2e53-4387-b3e5-74cd43934cf5',
  ownerEntityId: 'bfef2866-e88b-4fb7-a2a3-6942da3ab7ae',
  objectId: '522016aa-e400-49c3-8e43-b88a00569c6a',
  originalFileName: 'candidate-personal-name.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
};

describe('private file contracts', () => {
  it('builds an RLS-compatible key without embedding the original filename', () => {
    const key = buildPrivateObjectKey(intent);

    expect(key).toBe(
      '9a3975ad-2e53-4387-b3e5-74cd43934cf5/candidates/bfef2866-e88b-4fb7-a2a3-6942da3ab7ae/522016aa-e400-49c3-8e43-b88a00569c6a.pdf',
    );
    expect(key).not.toContain('candidate-personal-name');
    expect(objectKeyBelongsToUser(key, intent.ownerUserId)).toBe(true);
  });

  it('validates MIME and size against an injected policy', () => {
    expect(
      validatePrivateFileUpload(intent, {
        allowedMimeTypes: ['application/pdf'],
        maxBytes: 2048,
      }),
    ).toEqual({ valid: true, issues: [] });

    expect(
      validatePrivateFileUpload(intent, {
        allowedMimeTypes: ['image/png'],
        maxBytes: 512,
      }),
    ).toEqual({
      valid: false,
      issues: ['MIME_TYPE_NOT_ALLOWED', 'FILE_TOO_LARGE'],
    });
  });
});
