'use client';

import type {
  PublicationManualRetryAcceptance,
  PublicationStatusRecord,
} from '@recruitops/contracts';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface PublicationStatusPanelProps {
  postVariantId: string | null;
  items: readonly PublicationStatusRecord[];
  truncated: boolean;
  loading: boolean;
  loadError: boolean;
  retryingPublicationId: string | null;
  retryErrorId: string | null;
  retryAcceptance: PublicationManualRetryAcceptance | null;
  canMutate: boolean;
  onRefresh(): void;
  onRetry(publicationId: string): void;
}

export function PublicationStatusPanel({
  postVariantId,
  items,
  truncated,
  loading,
  loadError,
  retryingPublicationId,
  retryErrorId,
  retryAcceptance,
  canMutate,
  onRefresh,
  onRetry,
}: PublicationStatusPanelProps) {
  const t = useTranslations('contentStudio.publicationStatus');
  const locale = useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section
      className="space-y-5 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]"
      aria-labelledby="publication-status-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--content-secondary)]">{t('eyebrow')}</p>
          <h3
            id="publication-status-title"
            className="mt-1 text-xl font-semibold tracking-tight text-balance"
          >
            {t('title')}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--content-secondary)]">
            {t('description')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!postVariantId || loading}
          onClick={onRefresh}
        >
          <RefreshCw
            className="mr-2 size-4 data-[loading=true]:animate-spin motion-reduce:animate-none"
            data-loading={loading}
            aria-hidden="true"
          />
          {t('refresh')}
        </Button>
      </div>

      {!postVariantId ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-[var(--content-secondary)]">
          {t('saveVariantFirst')}
        </p>
      ) : null}

      {postVariantId && loading && items.length === 0 ? (
        <p className="text-sm text-[var(--content-secondary)]" role="status">
          {t('loading')}
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {t('loadFailed')}
        </p>
      ) : null}

      {retryAcceptance ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {t(`retryAcceptance.${retryAcceptance}`)}
        </p>
      ) : null}

      {postVariantId && !loading && !loadError && items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-[var(--content-secondary)]">
          {t('empty')}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-3" aria-live="polite">
          {items.map((publication) => {
            const retrying = retryingPublicationId === publication.id;
            const retryFailed = retryErrorId === publication.id;
            return (
              <article
                key={publication.id}
                className="min-w-0 space-y-3 rounded-xl border bg-[var(--surface-subtle)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold">{publication.destination.name}</h4>
                    <p className="mt-1 text-sm text-[var(--content-secondary)]">
                      {t('state', { value: t(`states.${publication.state}`) })}
                    </p>
                  </div>
                  {publication.canRetry && canMutate ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={retryingPublicationId !== null}
                      onClick={() => onRetry(publication.id)}
                    >
                      <RotateCcw
                        className="mr-2 size-4 data-[loading=true]:animate-spin motion-reduce:animate-none"
                        data-loading={retrying}
                        aria-hidden="true"
                      />
                      {retrying ? t('retrying') : t('retry')}
                    </Button>
                  ) : null}
                </div>

                <dl className="grid gap-2 text-sm md:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-[var(--content-secondary)]">{t('platformLabel')}</dt>
                    <dd className="break-words">{publication.destination.platform}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[var(--content-secondary)]">{t('attemptsLabel')}</dt>
                    <dd>{publication.retryCount}</dd>
                  </div>
                  {publication.scheduledAt ? (
                    <div className="min-w-0">
                      <dt className="text-[var(--content-secondary)]">{t('scheduledLabel')}</dt>
                      <dd>{dateFormatter.format(new Date(publication.scheduledAt))}</dd>
                    </div>
                  ) : null}
                  {publication.publishedAt ? (
                    <div className="min-w-0">
                      <dt className="text-[var(--content-secondary)]">{t('publishedLabel')}</dt>
                      <dd>{dateFormatter.format(new Date(publication.publishedAt))}</dd>
                    </div>
                  ) : null}
                  {publication.nextRetryAt ? (
                    <div className="min-w-0">
                      <dt className="text-[var(--content-secondary)]">{t('nextRetryLabel')}</dt>
                      <dd>{dateFormatter.format(new Date(publication.nextRetryAt))}</dd>
                    </div>
                  ) : null}
                </dl>

                {publication.lastErrorCode ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                    <p className="font-medium break-all">{publication.lastErrorCode}</p>
                    {publication.lastErrorMessage ? (
                      <p className="mt-1 break-words">{publication.lastErrorMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                {publication.retryBlockReason === 'MANUAL_REVIEW_REQUIRED' ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {t('manualReviewRequired')}
                  </p>
                ) : null}

                {retryFailed ? (
                  <p className="text-sm text-red-800" role="alert">
                    {t('retryFailed')}
                  </p>
                ) : null}

                {!canMutate && publication.state === 'FAILED' ? (
                  <p className="text-sm text-[var(--content-secondary)]">{t('readOnly')}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {truncated ? (
        <p className="text-xs leading-5 text-[var(--content-secondary)]">{t('truncated')}</p>
      ) : null}
    </section>
  );
}
