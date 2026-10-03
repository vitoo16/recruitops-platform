import {
  CommissionTransactionListResponseSchema,
  ReconciliationBatchListResponseSchema,
  type CommissionTransactionListResponse,
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

async function requestJson(apiUrl: string, token: string, path: string): Promise<unknown> {
  const response = await fetch(`${apiBase(apiUrl)}${path}`, {
    headers: { authorization: `Bearer ${token}` },
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

  return response.json();
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
