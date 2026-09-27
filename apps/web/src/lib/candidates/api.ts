import {
  ApplicationListResponseSchema,
  ApplicationSchema,
  CandidateListResponseSchema,
  CandidateSchema,
  type Application,
  type ApplicationListResponse,
  type ApplicationStatus,
  type Candidate,
  type CandidateListResponse,
  type CreateApplicationInput,
  type CreateCandidateInput,
} from '@recruitops/contracts';

export class CandidatesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'CandidatesApiError';
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
    let code = 'CANDIDATE_API_REQUEST_FAILED';
    try {
      const payload = (await response.json()) as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Preserve the stable fallback code for non-JSON upstream errors.
    }
    throw new CandidatesApiError(response.status, code);
  }

  return response.json();
}

export async function listCandidates(
  apiUrl: string,
  token: string,
  search = '',
): Promise<CandidateListResponse> {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set('search', normalizedSearch);

  return CandidateListResponseSchema.parse(
    await requestJson(apiUrl, token, `/candidates?${params.toString()}`),
  );
}

export async function createCandidate(
  apiUrl: string,
  token: string,
  input: CreateCandidateInput,
): Promise<Candidate> {
  return CandidateSchema.parse(
    await requestJson(apiUrl, token, '/candidates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function listApplications(
  apiUrl: string,
  token: string,
  candidateId: string,
): Promise<ApplicationListResponse> {
  const params = new URLSearchParams({ candidateId, page: '1', pageSize: '100' });
  return ApplicationListResponseSchema.parse(
    await requestJson(apiUrl, token, `/applications?${params.toString()}`),
  );
}

export async function createApplication(
  apiUrl: string,
  token: string,
  input: CreateApplicationInput,
): Promise<Application> {
  return ApplicationSchema.parse(
    await requestJson(apiUrl, token, '/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function updateApplicationStatus(
  apiUrl: string,
  token: string,
  id: string,
  status: ApplicationStatus,
): Promise<Application> {
  return ApplicationSchema.parse(
    await requestJson(apiUrl, token, `/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  );
}
