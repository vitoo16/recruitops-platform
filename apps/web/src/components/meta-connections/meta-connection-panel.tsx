'use client';

import type { IntegrationHealthResponse } from '@recruitops/contracts';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  Camera,
  Link2,
  PanelsTopLeft,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  confirmMetaSelection,
  getIntegrationHealth,
  getMetaSelection,
  startMetaConnection,
  type MetaAccountSelection,
  type MetaConnectionTarget,
  type MetaSelectionResponse,
} from '@/lib/meta-connections/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

const StartFormSchema = z
  .object({
    facebook: z.boolean(),
    instagram: z.boolean(),
  })
  .refine((value) => value.facebook || value.instagram, { path: ['facebook'] });

const SelectionFormSchema = z.object({
  accounts: z.array(z.string()).min(1),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
type StartForm = z.infer<typeof StartFormSchema>;
type SelectionForm = z.infer<typeof SelectionFormSchema>;
type MetaHealth = IntegrationHealthResponse['meta'];

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

function readReturnState(): { status: string | null; connectionSessionId: string | null } {
  if (typeof window === 'undefined') return { status: null, connectionSessionId: null };
  const url = new URL(window.location.href);
  return {
    status: url.searchParams.get('metaConnectionStatus'),
    connectionSessionId: url.searchParams.get('metaConnectionSession'),
  };
}

function clearReturnState(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('metaConnectionStatus');
  url.searchParams.delete('metaConnectionSession');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function selectionKey(selection: MetaAccountSelection): string {
  return selection.platform === 'FACEBOOK'
    ? `FACEBOOK:${selection.pageId}`
    : `INSTAGRAM:${selection.pageId}:${selection.instagramAccountId}`;
}

function parseSelectionKey(value: string): MetaAccountSelection | null {
  const [platform, pageId, instagramAccountId] = value.split(':');
  if (platform === 'FACEBOOK' && pageId) return { platform: 'FACEBOOK', pageId };
  if (platform === 'INSTAGRAM' && pageId && instagramAccountId) {
    return { platform: 'INSTAGRAM', pageId, instagramAccountId };
  }
  return null;
}

function isMetaTarget(value: string): value is MetaConnectionTarget {
  return value === 'FACEBOOK' || value === 'INSTAGRAM';
}

export function MetaConnectionPanel() {
  const t = useTranslations('metaConnections');
  const configuredApiUrl = useMemo(apiUrl, []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [health, setHealth] = useState<MetaHealth | null>(null);
  const [selection, setSelection] = useState<MetaSelectionResponse | null>(null);
  const [returnState, setReturnState] = useState(readReturnState);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirectingTarget, setRedirectingTarget] = useState<MetaConnectionTarget | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startForm = useForm<StartForm>({
    defaultValues: { facebook: false, instagram: false },
  });
  const selectionForm = useForm<SelectionForm>({ defaultValues: { accounts: [] } });

  const canManage = role === 'OWNER' || role === 'ADMIN';

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
        setHealth(null);
        setSelection(null);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || !configuredApiUrl) return;
    let active = true;

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
      });

    return () => {
      active = false;
    };
  }, [configuredApiUrl, session]);

  const loadHealth = useCallback(async () => {
    if (!session?.access_token || !configuredApiUrl || !canManage) return;
    setLoadingHealth(true);
    try {
      const result = await getIntegrationHealth(configuredApiUrl, session.access_token);
      setHealth(result.meta);
    } catch {
      setHealth(null);
      setError(t('healthLoadFailed'));
    } finally {
      setLoadingHealth(false);
    }
  }, [canManage, configuredApiUrl, session?.access_token, t]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (returnState.status === 'denied') {
      setStatusMessage(t('authorizationDenied'));
      setError(null);
    }
  }, [returnState.status, t]);

  useEffect(() => {
    if (
      !session?.access_token ||
      !configuredApiUrl ||
      !canManage ||
      returnState.status !== 'ready' ||
      !returnState.connectionSessionId
    ) {
      return;
    }

    let active = true;
    setLoadingSelection(true);
    setError(null);
    void getMetaSelection(configuredApiUrl, session.access_token, returnState.connectionSessionId)
      .then((nextSelection) => {
        if (!active) return;
        setSelection(nextSelection);
        selectionForm.reset({ accounts: [] });
        setStatusMessage(t('chooseAccounts'));
      })
      .catch(() => {
        if (active) setError(t('selectionLoadFailed'));
      })
      .finally(() => {
        if (active) setLoadingSelection(false);
      });

    return () => {
      active = false;
    };
  }, [canManage, configuredApiUrl, returnState, selectionForm, session?.access_token, t]);

  async function beginAuthorization(targets: readonly MetaConnectionTarget[]) {
    if (!session?.access_token || !configuredApiUrl || !canManage) return;
    setError(null);
    setStatusMessage(null);
    setRedirectingTarget(targets.length === 1 ? targets[0]! : null);

    try {
      const result = await startMetaConnection(configuredApiUrl, session.access_token, targets);
      window.location.assign(result.authorizationUrl);
    } catch {
      setRedirectingTarget(null);
      setError(t('startFailed'));
    }
  }

  function beginReconnect(platform: string) {
    if (!isMetaTarget(platform)) return;
    void beginAuthorization([platform]);
  }

  async function onStart(values: StartForm) {
    const parsed = StartFormSchema.safeParse(values);
    if (!parsed.success) {
      setError(t('chooseTarget'));
      return;
    }

    const targets: MetaConnectionTarget[] = [];
    if (parsed.data.facebook) targets.push('FACEBOOK');
    if (parsed.data.instagram) targets.push('INSTAGRAM');
    await beginAuthorization(targets);
  }

  async function onConfirm(values: SelectionForm) {
    if (!session?.access_token || !configuredApiUrl || !selection) return;
    setSubmitting(true);
    setError(null);

    const parsed = SelectionFormSchema.safeParse(values);
    const accounts = parsed.success
      ? parsed.data.accounts
          .map(parseSelectionKey)
          .filter((account): account is MetaAccountSelection => account !== null)
      : [];
    if (accounts.length === 0) {
      setSubmitting(false);
      setError(t('chooseAtLeastOne'));
      return;
    }

    try {
      const result = await confirmMetaSelection(
        configuredApiUrl,
        session.access_token,
        selection.connectionSessionId,
        accounts,
      );
      setSelection(null);
      selectionForm.reset({ accounts: [] });
      clearReturnState();
      setReturnState({ status: null, connectionSessionId: null });
      setStatusMessage(t('connected', { count: result.connected.length }));
      await loadHealth();
    } catch {
      setError(t('confirmFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function dismissReturnMessage() {
    clearReturnState();
    setReturnState({ status: null, connectionSessionId: null });
    setStatusMessage(null);
    setError(null);
    setSelection(null);
  }

  if (!configuredApiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }

  if (!session) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }

  if (!canManage) {
    return <p className="text-sm text-neutral-500">{t('ownerAdminRequired')}</p>;
  }

  return (
    <section className="space-y-6 rounded-2xl border bg-white p-6" aria-labelledby="meta-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h2 id="meta-title" className="mt-1 text-2xl font-semibold tracking-tight">
            {t('title')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{t('description')}</p>
        </div>
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
      </div>

      <div className="space-y-4 rounded-xl border bg-neutral-50 p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4" aria-hidden="true" />
            <h3 className="font-semibold">{t('healthTitle')}</h3>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadHealth()}
            disabled={loadingHealth}
          >
            <RefreshCw
              className="mr-2 size-4 data-[loading=true]:animate-spin motion-reduce:animate-none"
              data-loading={loadingHealth}
              aria-hidden="true"
            />
            {t('refreshHealth')}
          </Button>
        </div>

        {loadingHealth && !health ? (
          <p className="text-sm text-neutral-500">{t('loadingHealth')}</p>
        ) : null}

        {health ? (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{t('healthStatusLabel')}:</span>{' '}
              {t(`healthStatus.${health.status}`)}
            </p>
            {!health.configured ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('runtimeNotConfigured')}
              </p>
            ) : null}
            {health.accounts.length === 0 ? (
              <p className="text-sm text-neutral-500">{t('noConnectedAccounts')}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {health.accounts.map((account) => (
                  <article key={account.id} className="rounded-lg border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{account.displayName}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {t(`accountPlatform.${account.platform}`)} ·{' '}
                          {t(`accountStatus.${account.status}`)}
                        </p>
                      </div>
                      {account.requiresReconnect && isMetaTarget(account.platform) ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!health.configured || redirectingTarget !== null}
                          onClick={() => beginReconnect(account.platform)}
                        >
                          <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                          {redirectingTarget === account.platform
                            ? t('redirecting')
                            : t('reconnect')}
                        </Button>
                      ) : null}
                    </div>
                    {account.reconnectReason ? (
                      <p className="mt-3 text-sm text-amber-700">
                        {t(`reconnectReason.${account.reconnectReason}`)}
                      </p>
                    ) : null}
                    {account.expiresAt ? (
                      <p className="mt-2 text-xs text-neutral-500">
                        {t('credentialExpiry', {
                          value: new Date(account.expiresAt).toLocaleString(),
                        })}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {statusMessage ? (
        <div
          className="flex items-start justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          <span>{statusMessage}</span>
          {!selection ? (
            <Button type="button" variant="outline" onClick={dismissReturnMessage}>
              {t('dismiss')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!selection ? (
        <form className="space-y-4" onSubmit={startForm.handleSubmit(onStart)} noValidate>
          <fieldset className="space-y-3" disabled={health?.configured === false}>
            <legend className="text-sm font-semibold">{t('targetsLegend')}</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <input className="mt-1 size-4" type="checkbox" {...startForm.register('facebook')} />
              <span>
                <span className="flex items-center gap-2 font-medium">
                  <PanelsTopLeft className="size-4" aria-hidden="true" />
                  {t('facebook')}
                </span>
                <span className="mt-1 block text-sm leading-6 text-neutral-500">
                  {t('facebookHint')}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <input className="mt-1 size-4" type="checkbox" {...startForm.register('instagram')} />
              <span>
                <span className="flex items-center gap-2 font-medium">
                  <Camera className="size-4" aria-hidden="true" />
                  {t('instagram')}
                </span>
                <span className="mt-1 block text-sm leading-6 text-neutral-500">
                  {t('instagramHint')}
                </span>
              </span>
            </label>
          </fieldset>
          <Button
            type="submit"
            disabled={
              startForm.formState.isSubmitting ||
              loadingSelection ||
              health?.configured === false ||
              redirectingTarget !== null
            }
          >
            <Link2 className="mr-2 size-4" aria-hidden="true" />
            {startForm.formState.isSubmitting ? t('redirecting') : t('connectAction')}
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={selectionForm.handleSubmit(onConfirm)} noValidate>
          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="text-sm font-semibold">{t('accountsLegend')}</legend>
            {selection.accounts.length === 0 ? (
              <p className="rounded-xl border p-4 text-sm text-neutral-500">{t('noAccounts')}</p>
            ) : null}
            {selection.accounts.map((account) => {
              const facebookValue: MetaAccountSelection = {
                platform: 'FACEBOOK',
                pageId: account.pageId,
              };
              const instagram = account.instagramProfessionalAccount;
              return (
                <article key={account.pageId} className="space-y-3 rounded-xl border p-4">
                  <div>
                    <h3 className="font-semibold">{account.pageName}</h3>
                    <p className="mt-1 text-xs text-neutral-500">
                      {t('pageId', { id: account.pageId })}
                    </p>
                  </div>
                  {selection.targets.includes('FACEBOOK') ? (
                    <label className="flex items-start gap-3">
                      <input
                        className="mt-1 size-4"
                        type="checkbox"
                        value={selectionKey(facebookValue)}
                        {...selectionForm.register('accounts')}
                      />
                      <span className="text-sm">
                        <span className="font-medium">{t('connectFacebookPage')}</span>
                        <span className="mt-1 block text-neutral-500">
                          {t('facebookDestinationHint')}
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {selection.targets.includes('INSTAGRAM') ? (
                    instagram ? (
                      <label className="flex items-start gap-3">
                        <input
                          className="mt-1 size-4"
                          type="checkbox"
                          value={selectionKey({
                            platform: 'INSTAGRAM',
                            pageId: account.pageId,
                            instagramAccountId: instagram.id,
                          })}
                          {...selectionForm.register('accounts')}
                        />
                        <span className="text-sm">
                          <span className="font-medium">
                            {instagram.name ?? instagram.username ?? t('instagramProfessional')}
                          </span>
                          <span className="mt-1 block text-neutral-500">
                            {instagram.username ? `@${instagram.username} · ` : ''}
                            {t('instagramDestinationHint')}
                          </span>
                        </span>
                      </label>
                    ) : (
                      <p className="text-sm text-amber-700">{t('instagramNotLinked')}</p>
                    )
                  ) : null}
                </article>
              );
            })}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={submitting || selection.accounts.length === 0}>
              {submitting ? t('connecting') : t('confirmAction')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={dismissReturnMessage}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}

      {loadingSelection ? (
        <p className="flex items-center gap-2 text-sm text-neutral-500" aria-live="polite">
          <RefreshCw
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t('loadingSelection')}
        </p>
      ) : null}
    </section>
  );
}
