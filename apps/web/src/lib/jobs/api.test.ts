import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobsApiError, listJobs, updateJobStatus } from './api.js';

const job = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Frontend Developer',
  companyName: 'Example Company',
  description: 'Build and maintain customer-facing web experiences.',
  location: null,
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  currency: 'VND',
  salaryMinMinor: null,
  salaryMaxMinor: null,
  sourceRef: null,
  commissionNote: null,
  createdAt: '2026-09-27T09:00:00.000Z',
  updatedAt: '2026-09-27T09:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jobs API client', () => {
  it('sends the bearer token and normalized search query', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [job], page: 1, pageSize: 50, total: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listJobs('https://api.example.test/api/', 'token-123', '  frontend  ');

    expect(result.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/jobs?page=1&pageSize=50&search=frontend',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('surfaces stable API errors for authorization failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'FORBIDDEN' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(
      updateJobStatus('https://api.example.test/api', 'viewer-token', job.id, 'CLOSED'),
    ).rejects.toEqual(expect.objectContaining<Partial<JobsApiError>>({ status: 403 }));
  });
});
