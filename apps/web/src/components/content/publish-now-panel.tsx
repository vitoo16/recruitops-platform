'use client';

import type { PublishNowReadiness, PublishNowResponse } from '@recruitops/contracts';
import { RefreshCw, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface PublishNowPanelProps {
  postVariantId: string | null;
  readiness: PublishNowReadiness | null;
  destinationId: string;
  loadingReadiness: boolean;
  readinessError: boolean;
  publishing: boolean;
  publishErrorStatus: number | null;
  result: PublishNowResponse | null;
  canMutate: boolean;
  onDestinationChange(value: string): void;
  onRefreshReadiness(): void;
  onPublishNow(): void;
}

export function PublishNowPanel({
  postVariantId,
  readiness,
  destinationId,
  loadingReadiness,
  readinessError,
  publishing,
  publishErrorStatus,
  result,
  canMutate,
  onDestinationChange,
  onRefreshReadiness,
  onPublishNow,
}: PublishNowPanelProps) {
  const t = useTranslations('contentStudio.publishNow');
  const canQueue = Boolean(canMutate && readiness?.canPublish && destinationId && !publishing);

  return (
    <section
      className="space-y-5 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]"
      aria-labelledby="publish-now-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--content-secondary)]">{t('eyebrow')}</p>
          <h3 id="publish-now-title" className="mt-1 text-xl font-semibold tracking-tight text-balance">
            {t('title')}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--content-secondary)]">
            {t('description')}
          </p>
        </div>
        <Send className="size-5 shrink-0" aria-hidden="true" />
      </div>

      {!postVariantId ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-[var(--content-secondary)]">
          {t('saveVariantFirst')}
        </p>
      ) : null}

      {postVariantId && loadingReadiness ? (
        <p className="text-sm text-[var(--content-secondary)]" role="status">
          {t('loading')}
        </p>
      ) : null}

      {postVariantId && readinessError ? (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p role="alert">{t('readinessFailed')}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={onRefreshReadiness}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            {t('retryReadiness')}
          </Button>
        </div>
      ) : null}

      {readiness ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--content-secondary)]">
            <span>{t('platform', { value: readiness.platform })}</span>
            <span>{t('postStatus', { value: readiness.postStatus })}</span>
          </div>

          {readiness.blockingReasons.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
              <p className="font-medium">{t('blockedTitle')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {readiness.blockingReasons.map((reason) => (
                  <li key={reason}>{t(`blockingReasons.${reason}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {readiness.destinations.length > 0 ? (
            <div className="space-y-2">
              <label htmlFor="publish-now-destination" className="text-sm font-medium">
                {t('destination')}
              </label>
              <select
                id="publish-now-destination"
                name="publishNowDestination"
                className="min-h-11 w-full rounded-xl border bg-[var(--surface-panel)] px-3 text-sm text-[var(--content-primary)]"
                value={destinationId}
                disabled={publishing}
                onChange={(event) => onDestinationChange(event.target.value)}
              >
                {readiness.destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name} · {destination.type}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-[var(--content-secondary)]">
                {t('destinationHint')}
              </p>
            </div>
          ) : null}

          {!canMutate ? (
            <p className="text-sm text-[var(--content-secondary)]">{t('readOnly')}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="min-h-11"
              disabled={!canQueue}
              onClick={onPublishNow}
            >
              <Send className="mr-2 size-4" aria-hidden="true" />
              {publishing ? t('queueing') : t('queueAction')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={loadingReadiness || publishing}
              onClick={onRefreshReadiness}
            >
              <RefreshCw
                className="mr-2 size-4 data-[loading=true]:animate-spin motion-reduce:animate-none"
                data-loading={loadingReadiness}
                aria-hidden="true"
              />
              {t('refreshReadiness')}
            </Button>
          </div>

          <p className="text-xs leading-5 text-[var(--content-secondary)]">{t('queueDisclaimer')}</p>
        </div>
      ) : null}

      <div aria-live="polite">
        {result ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            {result.acceptance === 'QUEUED'
              ? t('queuedSuccess', { state: result.publication.state })
              : t('alreadyAccepted', { state: result.publication.state })}
          </p>
        ) : null}

        {publishErrorStatus !== null ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {publishErrorStatus === 503 ? t('queueUnconfirmed') : t('publishFailed')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
