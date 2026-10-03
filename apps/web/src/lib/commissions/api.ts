import {
  CommissionTransactionListResponseSchema,
  CreateReconciliationBatchSchema,
  ReconciliationBatchDetailSchema,
  ReconciliationBatchIdSchema,
  ReconciliationBatchListResponseSchema,
  type CommissionTransactionListResponse,
  type CreateReconciliationBatchInput,
  type ReconciliationBatchDetail,
  type ReconciliationBatchListResponse,
} from '@recruitops/contracts';

export class CommissionsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'CommissionsApiError';
  }
}

function apiBase(apiUrl: string): string {
  return apiUrl.replace(/\/$/, '');
}

async function request(
  apiUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${apiBase(apiUrl)}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let code = 'COMMISSION_API_REQUEST_FAILED';
    try {
      const payload = (await response.json()) as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Preserve the stable fallback code when an upstream response is not JSON.
    }
    throw new CommissionsApiError(response.status, code);
  }

  return response;
}

async function requestJson(
  apiUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  return (await request(apiUrl, token, path, init)).json();
}

export async function listCommissionTransactions(
  apiUrl: string,
  token: string,
): Promise<CommissionTransactionListResponse> {
  return CommissionTransactionListResponseSchema.parse(
    await requestJson(apiUrl, token, '/commissions?page=1&pageSize=100'),
  );
}

export async function listReconciliationBatches(
  apiUrl: string,
  token: string,
): Promise<ReconciliationBatchListResponse> {
  return ReconciliationBatchListResponseSchema.parse(
    await requestJson(apiUrl, token, '/commissions/reconciliation-batches?page=1&pageSize=100'),
  );
}

export async function createReconciliationBatch(
  apiUrl: string,
  token: string,
  input: CreateReconciliationBatchInput,
): Promise<ReconciliationBatchDetail> {
  const parsed = CreateReconciliationBatchSchema.parse(input);
  return ReconciliationBatchDetailSchema.parse(
    await requestJson(apiUrl, token, '/commissions/reconciliation-batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed),
    }),
  );
}

export async function markReconciliationBatchPaid(
  apiUrl: string,
  token: string,
  batchId: string,
): Promise<ReconciliationBatchDetail> {
  const parsedBatchId = ReconciliationBatchIdSchema.parse(batchId);
  return ReconciliationBatchDetailSchema.parse(
    await requestJson(
      apiUrl,
      token,
      `/commissions/reconciliation-batches/${encodeURIComponent(parsedBatchId)}/mark-paid`,
      { method: 'POST' },
    ),
  );
}

export async function downloadReconciliationBatchCsv(
  apiUrl: string,
  token: string,
  batchId: string,
): Promise<{ blob: Blob; filename: string }> {
  const parsedBatchId = ReconciliationBatchIdSchema.parse(batchId);
  const response = await request(
    apiUrl,
    token,
    `/commissions/reconciliation-batches/${encodeURIComponent(parsedBatchId)}/export.csv`,
  );
  const disposition = response.headers.get('content-disposition');
  const matchedFilename = disposition?.match(/filename="([^"]+)"/i)?.[1];

  return {
    blob: await response.blob(),
    filename: matchedFilename ?? `commission-reconciliation-${parsedBatchId}.csv`,
  };
}
