import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPrivateDownloadUrl, uploadPrivateFile } from './private-files.js';

const userId = '9a3975ad-2e53-4387-b3e5-74cd43934cf5';

function createFakeClient(): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'stored' }, error: null }),
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://example.test/private' },
          error: null,
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe('private file Supabase adapter', () => {
  it('uploads into a user-scoped private object key', async () => {
    const file = new File(['cv'], 'person.pdf', { type: 'application/pdf' });

    await expect(
      uploadPrivateFile({
        client: createFakeClient(),
        intent: {
          purpose: 'CANDIDATE_CV',
          ownerUserId: userId,
          ownerEntityId: 'bfef2866-e88b-4fb7-a2a3-6942da3ab7ae',
          objectId: '522016aa-e400-49c3-8e43-b88a00569c6a',
          originalFileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
        policy: { allowedMimeTypes: ['application/pdf'], maxBytes: 1024 },
        file,
      }),
    ).resolves.toEqual({
      bucket: 'recruitops-private',
      objectKey:
        '9a3975ad-2e53-4387-b3e5-74cd43934cf5/candidates/bfef2866-e88b-4fb7-a2a3-6942da3ab7ae/522016aa-e400-49c3-8e43-b88a00569c6a.pdf',
    });
  });

  it('refuses to sign an object owned by another user', async () => {
    await expect(
      createPrivateDownloadUrl({
        client: createFakeClient(),
        objectKey: 'another-user/candidates/x/y.pdf',
        expiresInSeconds: 300,
      }),
    ).rejects.toThrow('OBJECT_NOT_OWNED_BY_USER');
  });
});
