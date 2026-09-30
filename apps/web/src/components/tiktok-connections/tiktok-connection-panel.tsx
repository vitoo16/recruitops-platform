'use client';

import { Music2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useTikTokConnection } from './use-tiktok-connection';

export function TikTokConnectionPanel() {
  const t = useTranslations('tiktokConnections');
  const locale = useLocale();
  const workspace = useTikTokConnection();
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (!workspace.apiConfigured)
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  if (!workspace.signedIn)
    return <p className="text-sm text-[var(--content-secondary)]">{t('signInRequired')}</p>;
  if (!workspace.canManage)
    return <p className="text-sm text-[var(--content-secondary)]">{t('ownerAdminRequired')}</p>;

  return (
    <section
      className="space-y-6 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]"
      aria-labelledby="tiktok-connection-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--content-secondary)]">{t('eyebrow')}</p>
          <h2
            id="tiktok-connection-title"
            className="mt-1 text-2xl font-semibold tracking-tight text-balance"
          >
            {t('title')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--content-secondary)]">
            {t('description')}
          </p>
        </div>
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
      </div>

      {workspace.notice ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
          role="status"
        >
          <span>{workspace.notice === 'connected' ? t('connectedNotice') : t('deniedNotice')}</span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={workspace.dismissNotice}
          >
            {t('dismiss')}
          </Button>
        </div>
      ) : null}
      {workspace.loadError ? (
        <p role="alert" className="text-sm text-red-700">
          {t('loadFailed')}
        </p>
      ) : null}
      {workspace.startError ? (
        <p role="alert" className="text-sm text-red-700">
          {t('startFailed')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          className="min-h-11"
          disabled={workspace.redirecting}
          onClick={() => void workspace.connect()}
        >
          <Music2 className="mr-2 size-4" aria-hidden="true" />
          {workspace.redirecting
            ? t('redirecting')
            : workspace.accounts.length
              ? t('reconnect')
              : t('connect')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={workspace.loading}
          onClick={() => void workspace.refresh()}
        >
          <RefreshCw
            className="mr-2 size-4 data-[loading=true]:animate-spin motion-reduce:animate-none"
            data-loading={workspace.loading}
            aria-hidden="true"
          />
          {t('refresh')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2" aria-live="polite">
        {workspace.accounts.length === 0 && !workspace.loading && !workspace.loadError ? (
          <p className="text-sm text-[var(--content-secondary)]">{t('noAccounts')}</p>
        ) : null}
        {workspace.accounts.map((account) => (
          <article
            key={account.id}
            className="min-w-0 rounded-xl border bg-[var(--surface-subtle)] p-4"
          >
            <h3 className="truncate font-semibold">{account.displayName}</h3>
            <p className="mt-2 break-all text-xs text-[var(--content-secondary)]">
              {t('accountId', { id: account.externalAccountId })}
            </p>
            <p className="mt-2 text-sm">
              {t('status', { value: t(`statusValues.${account.status}`) })}
            </p>
            {account.expiresAt ? (
              <p className="mt-2 text-sm text-[var(--content-secondary)]">
                {t('expires', { value: dates.format(new Date(account.expiresAt)) })}
              </p>
            ) : null}
            <p className="mt-2 break-words text-sm text-[var(--content-secondary)]">
              {t('scopes', { value: account.scopes.join(', ') })}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
