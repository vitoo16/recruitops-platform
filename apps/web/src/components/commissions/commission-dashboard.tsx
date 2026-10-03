'use client';

import type { Session } from '@supabase/supabase-js';
import type {
  CommissionMilestone,
  CommissionTransaction,
  CommissionTransactionStatus,
  ReconciliationBatch,
} from '@recruitops/contracts';
import { CheckCircle2, Download, RefreshCw, WalletCards } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  CommissionsApiError,
  createReconciliationBatch,
  downloadReconciliationBatchCsv,
  listCommissionTransactions,
  listReconciliationBatches,
  markReconciliationBatchPaid,
} from '@/lib/commissions/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
type MilestoneFilter = 'ALL' | CommissionMilestone;
type StatusFilter = 'ALL' | CommissionTransactionStatus;

const milestones: CommissionMilestone[] = ['INTERVIEW_INVITED', 'WORKED_30_DAYS'];
const statuses: CommissionTransactionStatus[] = ['ACCRUED', 'BATCHED', 'PAID', 'VOIDED'];

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

function amountSummary(
  items: readonly { currency: string; amountMinor: number }[],
  locale: string,
): string {
  const totals = new Map<string, bigint>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + BigInt(item.amountMinor));
  }
  if (totals.size === 0) return '—';

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => `${new Intl.NumberFormat(locale).format(amount)} ${currency}`)
    .join(' · ');
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function payoutMilestone(payableOn: string): CommissionMilestone | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payableOn)) return null;
  const day = Number(payableOn.slice(8, 10));
  if (day === 5) return 'INTERVIEW_INVITED';
  if (day === 15) return 'WORKED_30_DAYS';
  return null;
}

export function CommissionDashboard() {
  const t = useTranslations('commissionDashboard');
  const locale = useLocale();
  const configuredApiUrl = useMemo(apiUrl, []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [transactions, setTransactions] = useState<CommissionTransaction[]>([]);
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [milestoneFilter, setMilestoneFilter] = useState<MilestoneFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportingBatchId, setExportingBatchId] = useState<string | null>(null);
  const [payingBatchId, setPayingBatchId] = useState<string | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [payableOn, setPayableOn] = useState('');
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);

  const canView = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setRole(null);
        setTransactions([]);
        setBatches([]);
        setTransactionTotal(0);
        setBatchTotal(0);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || !configuredApiUrl) {
      setRole(null);
      return;
    }

    let active = true;
    setAccessLoading(true);
    void fetch(`${configuredApiUrl}/auth/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('principal_failed');
        return PrincipalSchema.parse(await response.json());
      })
      .then((principal) => {
        if (active) setRole(principal.role);
      })
      .catch(() => {
        if (active) setRole(null);
      })
      .finally(() => {
        if (active) setAccessLoading(false);
      });

    return () => {
      active = false;
    };
  }, [configuredApiUrl, session]);

  async function loadDashboard() {
    if (!session?.access_token || !configuredApiUrl || !canView) return;
    setLoading(true);
    setError(null);

    try {
      const [ledger, reconciliation] = await Promise.all([
        listCommissionTransactions(configuredApiUrl, session.access_token),
        listReconciliationBatches(configuredApiUrl, session.access_token),
      ]);
      setTransactions(ledger.items);
      setTransactionTotal(ledger.total);
      setBatches(reconciliation.items);
      setBatchTotal(reconciliation.total);
    } catch (caught) {
      setError(
        caught instanceof CommissionsApiError && caught.status === 403
          ? t('restricted')
          : t('loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canView) void loadDashboard();
    // Loading is intentionally tied to the verified financial role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, configuredApiUrl, session?.access_token]);

  async function exportBatch(batchId: string) {
    if (!session?.access_token || !configuredApiUrl || !canView) return;
    setExportingBatchId(batchId);
    setError(null);
    try {
      const exported = await downloadReconciliationBatchCsv(
        configuredApiUrl,
        session.access_token,
        batchId,
      );
      const href = URL.createObjectURL(exported.blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = exported.filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (caught) {
      setError(
        caught instanceof CommissionsApiError && caught.status === 403
          ? t('restricted')
          : t('exportFailed'),
      );
    } finally {
      setExportingBatchId(null);
    }
  }

  async function createBatch() {
    if (
      !session?.access_token ||
      !configuredApiUrl ||
      !canView ||
      !payoutMilestone(payableOn) ||
      selectedTransactionIds.length === 0
    ) {
      return;
    }

    setCreatingBatch(true);
    setError(null);
    setNotice(null);
    try {
      await createReconciliationBatch(configuredApiUrl, session.access_token, {
        id: crypto.randomUUID(),
        payableOn,
        transactionIds: selectedTransactionIds,
      });
      setSelectedTransactionIds([]);
      setNotice(t('workflow.created'));
      await loadDashboard();
    } catch (caught) {
      setError(
        caught instanceof CommissionsApiError && caught.status === 403
          ? t('restricted')
          : t('workflow.createFailed'),
      );
    } finally {
      setCreatingBatch(false);
    }
  }

  async function markBatchPaid(batchId: string) {
    if (!session?.access_token || !configuredApiUrl || !canView) return;
    if (!window.confirm(t('workflow.confirmPaid'))) return;

    setPayingBatchId(batchId);
    setError(null);
    setNotice(null);
    try {
      await markReconciliationBatchPaid(configuredApiUrl, session.access_token, batchId);
      setNotice(t('workflow.paid'));
      await loadDashboard();
    } catch (caught) {
      setError(
        caught instanceof CommissionsApiError && caught.status === 403
          ? t('restricted')
          : t('workflow.payFailed'),
      );
    } finally {
      setPayingBatchId(null);
    }
  }

  const visibleTransactions = transactions.filter(
    (transaction) =>
      (milestoneFilter === 'ALL' || transaction.milestone === milestoneFilter) &&
      (statusFilter === 'ALL' || transaction.status === statusFilter),
  );

  const accrued = transactions.filter((transaction) => transaction.status === 'ACCRUED');
  const batched = transactions.filter((transaction) => transaction.status === 'BATCHED');
  const paid = transactions.filter((transaction) => transaction.status === 'PAID');
  const openBatches = batches.filter((batch) => batch.status === 'OPEN');
  const selectedMilestone = payoutMilestone(payableOn);
  const eligibleTransactions = accrued.filter(
    (transaction) => selectedMilestone !== null && transaction.milestone === selectedMilestone,
  );
  const selectedTransactions = eligibleTransactions.filter((transaction) =>
    selectedTransactionIds.includes(transaction.id),
  );
  const selectedCurrencies = new Set(
    selectedTransactions.map((transaction) => transaction.currency),
  );
  const canCreateBatch =
    selectedMilestone !== null &&
    selectedTransactionIds.length > 0 &&
    selectedTransactionIds.length === selectedTransactions.length &&
    selectedCurrencies.size === 1;
  const truncated = transactionTotal > transactions.length || batchTotal > batches.length;

  if (!configuredApiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }

  if (!session) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }

  if (accessLoading) {
    return <p className="text-sm text-neutral-500">{t('checkingAccess')}</p>;
  }

  if (!canView) {
    return (
      <p className="rounded-2xl border bg-white p-6 text-sm text-neutral-600">{t('restricted')}</p>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="commission-dashboard-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h2
            id="commission-dashboard-title"
            className="mt-1 text-2xl font-semibold tracking-tight"
          >
            {t('title')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{t('description')}</p>
        </div>
        <Button variant="outline" onClick={() => void loadDashboard()} disabled={loading}>
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          {t('refresh')}
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-live="polite"
        aria-busy={loading}
      >
        <SummaryCard
          label={t('summary.accrued')}
          value={amountSummary(accrued, locale)}
          count={accrued.length}
        />
        <SummaryCard
          label={t('summary.batched')}
          value={amountSummary(batched, locale)}
          count={batched.length}
        />
        <SummaryCard
          label={t('summary.paid')}
          value={amountSummary(paid, locale)}
          count={paid.length}
        />
        <SummaryCard
          label={t('summary.openBatches')}
          value={t('summary.batchCount', { count: openBatches.length })}
          count={batchTotal}
        />
      </div>

      {truncated ? (
        <p className="text-xs leading-5 text-neutral-500">{t('firstPageNote')}</p>
      ) : (
        <p className="text-xs leading-5 text-neutral-500">{t('minorUnitNote')}</p>
      )}

      <div className="space-y-4 rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="font-semibold">{t('ledger.title')}</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {t('ledger.count', { visible: visibleTransactions.length, total: transactionTotal })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Filter
              id="commission-milestone-filter"
              label={t('filters.milestone')}
              value={milestoneFilter}
              onChange={(value) => setMilestoneFilter(value as MilestoneFilter)}
              options={[
                ['ALL', t('filters.allMilestones')],
                ...milestones.map((milestone) => [milestone, t(`milestone.${milestone}`)] as const),
              ]}
            />
            <Filter
              id="commission-status-filter"
              label={t('filters.status')}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              options={[
                ['ALL', t('filters.allStatuses')],
                ...statuses.map((status) => [status, t(`status.${status}`)] as const),
              ]}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">{t('ledger.caption')}</caption>
            <thead>
              <tr className="border-b text-neutral-500">
                <th className="px-3 py-3 font-medium">{t('ledger.milestone')}</th>
                <th className="px-3 py-3 font-medium">{t('ledger.beneficiary')}</th>
                <th className="px-3 py-3 font-medium">{t('ledger.amount')}</th>
                <th className="px-3 py-3 font-medium">{t('ledger.earnedAt')}</th>
                <th className="px-3 py-3 font-medium">{t('ledger.status')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => (
                <tr key={transaction.id} className="border-b last:border-0">
                  <td className="px-3 py-3">{t(`milestone.${transaction.milestone}`)}</td>
                  <td className="px-3 py-3 font-mono text-xs" title={transaction.beneficiaryUserId}>
                    {shortId(transaction.beneficiaryUserId)}
                  </td>
                  <td className="px-3 py-3 font-medium">{amountSummary([transaction], locale)}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {formatDateTime(transaction.earnedAt, locale)}
                  </td>
                  <td className="px-3 py-3">{t(`status.${transaction.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visibleTransactions.length === 0 ? (
            <p className="py-6 text-sm text-neutral-500">{t('ledger.empty')}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border bg-white p-6">
        <div>
          <h3 className="font-semibold">{t('workflow.title')}</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-500">{t('workflow.description')}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <label htmlFor="reconciliation-payable-on" className="text-sm font-medium">
              {t('workflow.payableOn')}
            </label>
            <input
              id="reconciliation-payable-on"
              type="date"
              className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
              value={payableOn}
              onChange={(event) => {
                setPayableOn(event.target.value);
                setSelectedTransactionIds([]);
              }}
            />
            <p className="text-xs leading-5 text-neutral-500">{t('workflow.payoutDateHint')}</p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{t('workflow.eligibleTitle')}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {selectedMilestone
                  ? t('workflow.eligibleHint', {
                      milestone: t(`milestone.${selectedMilestone}`),
                      count: eligibleTransactions.length,
                    })
                  : t('workflow.choosePayoutDate')}
              </p>
            </div>

            {selectedMilestone && eligibleTransactions.length > 0 ? (
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-3">
                {eligibleTransactions.map((transaction) => {
                  const checked = selectedTransactionIds.includes(transaction.id);
                  return (
                    <label
                      key={transaction.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedTransactionIds((current) =>
                            event.target.checked
                              ? [...current, transaction.id]
                              : current.filter((id) => id !== transaction.id),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {amountSummary([transaction], locale)} ·{' '}
                          {shortId(transaction.beneficiaryUserId)}
                        </span>
                        <span className="mt-1 block font-mono text-xs text-neutral-500">
                          {transaction.id}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-500">
                {selectedMilestone ? t('workflow.noEligible') : t('workflow.choosePayoutDate')}
              </p>
            )}

            {selectedCurrencies.size > 1 ? (
              <p className="text-xs text-red-700">{t('workflow.currencyMismatch')}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void createBatch()}
                disabled={!canCreateBatch || creatingBatch}
              >
                <WalletCards className="mr-2 size-4" aria-hidden="true" />
                {creatingBatch ? t('workflow.creating') : t('workflow.create')}
              </Button>
              <span className="text-xs text-neutral-500">
                {t('workflow.selectedCount', { count: selectedTransactionIds.length })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-white p-6">
        <div className="flex items-center gap-2">
          <WalletCards className="size-4" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">{t('batches.title')}</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {t('batches.count', { total: batchTotal })}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">{t('batches.caption')}</caption>
            <thead>
              <tr className="border-b text-neutral-500">
                <th className="px-3 py-3 font-medium">{t('batches.payableOn')}</th>
                <th className="px-3 py-3 font-medium">{t('batches.milestone')}</th>
                <th className="px-3 py-3 font-medium">{t('batches.transactions')}</th>
                <th className="px-3 py-3 font-medium">{t('batches.total')}</th>
                <th className="px-3 py-3 font-medium">{t('batches.status')}</th>
                <th className="px-3 py-3 font-medium">{t('batches.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b last:border-0">
                  <td className="px-3 py-3">{batch.payableOn}</td>
                  <td className="px-3 py-3">{t(`milestone.${batch.milestone}`)}</td>
                  <td className="px-3 py-3">{batch.transactionCount}</td>
                  <td className="px-3 py-3 font-medium">
                    {amountSummary(
                      [{ currency: batch.currency, amountMinor: batch.totalAmountMinor }],
                      locale,
                    )}
                  </td>
                  <td className="px-3 py-3">{t(`batchStatus.${batch.status}`)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="h-9 px-3"
                        onClick={() => void exportBatch(batch.id)}
                        disabled={exportingBatchId === batch.id}
                      >
                        <Download className="mr-2 size-4" aria-hidden="true" />
                        {exportingBatchId === batch.id
                          ? t('batches.exporting')
                          : t('batches.export')}
                      </Button>
                      {batch.status === 'OPEN' ? (
                        <Button
                          className="h-9 px-3"
                          onClick={() => void markBatchPaid(batch.id)}
                          disabled={payingBatchId === batch.id}
                        >
                          <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                          {payingBatchId === batch.id
                            ? t('batches.markingPaid')
                            : t('batches.markPaid')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && batches.length === 0 ? (
            <p className="py-6 text-sm text-neutral-500">{t('batches.empty')}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, count }: { label: string; value: string; count: number }) {
  return (
    <article className="rounded-2xl border bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{count}</p>
    </article>
  );
}

function Filter({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <select
        id={id}
        className="h-10 min-w-48 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
