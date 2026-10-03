import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommissionsApiError,
  createReconciliationBatch,
  downloadReconciliationBatchCsv,
  listCommissionTransactions,
  listReconciliationBatches,
  markReconciliationBatchPaid,
} from './api.js';

const transaction = {
  id: '11111111-1111-4111-8111-111111111111',
  candidateId: '22222222-2222-4222-8222-222222222222',
  jobId: '33333333-3333-4333-8333-333333333333',
  applicationId: '44444444-4444-4444-8444-444444444444',
  beneficiaryUserId: '55555555-5555-4555-8555-555555555555',
  milestone: 'INTERVIEW_INVITED',
  currency: 'VND',
  baseAmountMinor: 100_000,
  amountMinor: 100_000,
  shareNumerator: 1,
  shareDenominator: 1,
  earnedAt: '2026-10-03T08:00:00.000Z',
  status: 'ACCRUED',
  idempotencyKey: 'commission:test',
  reconciliationBatchId: null,
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-03T08:00:00.000Z',
} as const;

const batch = {
  id: '66666666-6666-4666-8666-666666666666',
  payableOn: '2026-10-05',
  milestone: 'INTERVIEW_INVITED',
  currency: 'VND',
  transactionCount: 1,
  totalAmountMinor: 100_000,
  status: 'OPEN',
  createdByUserId: '77777777-7777-4777-8777-777777777777',
  paidByUserId: null,
  paidAt: null,
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-03T08:00:00.000Z',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('commission API client', () => {
  it('loads the first 100 ledger rows with bearer authentication', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ items: [transaction], page: 1, pageSize: 100, total: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await listCommissionTransactions('https://api.example.test/', 'token-123');

    expect(response.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/commissions?page=1&pageSize=100',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const request = vi.mocked(fetchMock).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get('authorization')).toBe('Bearer token-123');
  });

  it('loads reconciliation batches through their dedicated collection route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [batch], page: 1, pageSize: 100, total: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const response = await listReconciliationBatches('https://api.example.test', 'token-123');

    expect(response.items[0]?.status).toBe('OPEN');
  });

  it('creates an immutable reconciliation batch with JSON and bearer auth', async () => {
    const detail = { ...batch, transactionIds: [transaction.id] };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(detail), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await createReconciliationBatch('https://api.example.test', 'token-123', {
      id: batch.id,
      payableOn: batch.payableOn,
      transactionIds: [transaction.id],
    });

    expect(response.id).toBe(batch.id);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/commissions/reconciliation-batches',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify({
          id: batch.id,
          payableOn: batch.payableOn,
          transactionIds: [transaction.id],
        }),
      }),
    );
    const request = vi.mocked(fetchMock).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get('authorization')).toBe('Bearer token-123');
    expect(new Headers(request.headers).get('content-type')).toBe('application/json');
  });

  it('marks a reconciliation batch paid through the controlled transition route', async () => {
    const detail = {
      ...batch,
      status: 'PAID',
      paidByUserId: '88888888-8888-4888-8888-888888888888',
      paidAt: '2026-10-05T08:00:00.000Z',
      transactionIds: [transaction.id],
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(detail), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await markReconciliationBatchPaid(
      'https://api.example.test',
      'token-123',
      batch.id,
    );

    expect(response.status).toBe('PAID');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test/commissions/reconciliation-batches/${batch.id}/mark-paid`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('downloads a reconciliation CSV with the server-provided filename', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('\uFEFFreconciliation_batch_id\r\n', {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="batch-2026-10-05.csv"',
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await downloadReconciliationBatchCsv(
      'https://api.example.test',
      'token-123',
      batch.id,
    );

    expect(response.filename).toBe('batch-2026-10-05.csv');
    expect(await response.blob.text()).toContain('reconciliation_batch_id');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test/commissions/reconciliation-batches/${batch.id}/export.csv`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const request = vi.mocked(fetchMock).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get('authorization')).toBe('Bearer token-123');
  });

  it('surfaces stable API error codes for authorization failures', async () => {
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
      listCommissionTransactions('https://api.example.test', 'viewer-token'),
    ).rejects.toEqual(expect.objectContaining<Partial<CommissionsApiError>>({ status: 403 }));
  });
});
