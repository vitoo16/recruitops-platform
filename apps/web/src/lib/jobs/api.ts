import {
  JobListResponseSchema,
  JobSchema,
  type CreateJobInput,
  type Job,
  type JobListResponse,
  type JobStatus,
} from '@recruitops/contracts';

export class JobsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'JobsApiError';
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
    let code = 'JOB_API_REQUEST_FAILED';
    try {
      const payload = (await response.json()) as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Preserve the stable fallback code when an upstream response is not JSON.
    }
    throw new JobsApiError(response.status, code);
  }

  return response.json();
}

export async function listJobs(
  apiUrl: string,
  token: string,
  search = '',
): Promise<JobListResponse> {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set('search', normalizedSearch);

  return JobListResponseSchema.parse(
    await requestJson(apiUrl, token, `/jobs?${params.toString()}`),
  );
}

export async function createJob(
  apiUrl: string,
  token: string,
  input: CreateJobInput,
): Promise<Job> {
  return JobSchema.parse(
    await requestJson(apiUrl, token, '/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function updateJobStatus(
  apiUrl: string,
  token: string,
  id: string,
  status: JobStatus,
): Promise<Job> {
  return JobSchema.parse(
    await requestJson(apiUrl, token, `/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  );
}
