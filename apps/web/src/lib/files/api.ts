import {
  CandidateDocumentSchema,
  type CandidateDocument,
  type RegisterCandidateDocumentInput,
} from '@recruitops/contracts';

export class FilesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'FilesApiError';
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
    let code = 'FILES_API_REQUEST_FAILED';
    try {
      const payload = (await response.json()) as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Preserve stable fallback for non-JSON upstream errors.
    }
    throw new FilesApiError(response.status, code);
  }

  return response.json();
}

export async function listCandidateDocuments(
  apiUrl: string,
  token: string,
  candidateId: string,
): Promise<CandidateDocument[]> {
  const payload = await requestJson(apiUrl, token, `/candidates/${candidateId}/documents`);
  return CandidateDocumentSchema.array().parse(payload);
}

export async function registerCandidateDocument(
  apiUrl: string,
  token: string,
  input: RegisterCandidateDocumentInput,
): Promise<CandidateDocument> {
  return CandidateDocumentSchema.parse(
    await requestJson(apiUrl, token, '/files/candidate-documents', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}
