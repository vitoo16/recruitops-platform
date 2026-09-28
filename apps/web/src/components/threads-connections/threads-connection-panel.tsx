'use client';

import { AtSign, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useThreadsConnection } from './use-threads-connection';

export function ThreadsConnectionPanel() {
  const t = useTranslations('threadsConnections');
  const locale = useLocale();
  const workspace = useThreadsConnection();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  if (!workspace.apiConfigured) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }

  if (!workspace.signedIn) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }

  if (!workspace.canManage) {
    return <p className="text-sm text-neutral-500">{t('ownerAdminRequired')}</p>;
  }

  return (
    <section
      className="space-y-6 rounded-2xl border bg-white p-6"
      aria-labelledby="threads-connection-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h2
            id="threads-connection-title"
            className="mt-1 text-2xl font-semibold tracking-tight text-balance"
          >
            {t('title')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            {t('description')}
          </p>
        </div>
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
      </div>

      {workspace.notice ? (
        <div
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          <span>
            {workspace.notice === 'connected' ? t('connectedNotice') : t('deniedNotice')}
          </span>
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
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {t('loadFailed')}
        </p>
      ) : null}

      {workspace.startError ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
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
          <AtSign className="mr-2 size-4" aria-hidden="true" />
          {workspace.redirecting
            ? t('redirecting')
            : workspace.accounts.length > 0
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

      <div aria-live="polite">
        {workspace.loading && workspace.accounts.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('loading')}</p>
        ) : null}

        {!workspace.loading && workspace.accounts.length === 0 && !workspace.loadError ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-500">
            {t('noAccounts')}
          </p>
        ) : null}

        {workspace.accounts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {workspace.accounts.map((account) => (
              <article key={account.id} className="min-w-0 rounded-xl border bg-neutral-50 p-4">
                <div className="flex items-start gap-3">
                  <AtSign className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{account.displayName}</h3>
                    <p className="mt-2 break-all text-xs text-neutral-500">
                      {t('accountId', { id: account.externalAccountId })}
                    </p>
                    <p className="mt-2 text-sm text-neutral-700">
                      {t('status', { value: t(`statusValues.${account.status}`) })}
                    </p>
                    {account.expiresAt ? (
                      <p className="mt-2 text-sm text-neutral-600">
                        {t('expires', {
                          value: dateFormatter.format(new Date(account.expiresAt)),
                        })}
                      </p>
                    ) : null}
                    <p className="mt-2 break-words text-sm text-neutral-600">
                      {t('scopes', { value: account.scopes.join(', ') })}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
