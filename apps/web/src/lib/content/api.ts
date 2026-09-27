import {
  PostListResponseSchema,
  PostSchema,
  type CreatePostInput,
  type Post,
  type PostListResponse,
} from '@recruitops/contracts';

export class ContentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ContentApiError';
  }
}

function apiBase(apiUrl: string): string {
  return apiUrl.replace(/\/$/, '');
}

async function requestJson(
  apiUrl: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(`${apiBase(apiUrl)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let code = 'CONTENT_API_REQUEST_FAILED';
    try {
      const payload = (await response.json()) as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Preserve the stable fallback for non-JSON upstream errors.
    }
    throw new ContentApiError(response.status, code);
  }

  return response.json();
}

export async function listPosts(
  apiUrl: string,
  token: string,
  jobId?: string,
): Promise<PostListResponse> {
  const params = new URLSearchParams({ page: '1', pageSize: '100' });
  if (jobId) params.set('jobId', jobId);
  return PostListResponseSchema.parse(
    await requestJson(apiUrl, token, `/posts?${params.toString()}`),
  );
}

export async function createPost(
  apiUrl: string,
  token: string,
  input: CreatePostInput,
): Promise<Post> {
  return PostSchema.parse(
    await requestJson(apiUrl, token, '/posts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}
