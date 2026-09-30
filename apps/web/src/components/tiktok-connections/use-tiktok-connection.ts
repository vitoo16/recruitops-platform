'use client';

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  listTikTokAccounts,
  startTikTokConnection,
  type TikTokConnectedAccount,
} from '@/lib/tiktok-connections/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
export type TikTokConnectionNotice = 'connected' | 'denied' | null;

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

function returnNotice(): TikTokConnectionNotice {
  if (typeof window === 'undefined') return null;
  const value = new URL(window.location.href).searchParams.get('tiktokConnectionStatus');
  return value === 'connected' || value === 'denied' ? value : null;
}

export function useTikTokConnection() {
  const configuredApiUrl = useMemo(apiUrl, []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [accounts, setAccounts] = useState<readonly TikTokConnectedAccount[]>([]);
  const [notice, setNotice] = useState<TikTokConnectionNotice>(returnNotice);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [startError, setStartError] = useState(false);
  const canManage = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => active && setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRole(null);
        setAccounts([]);
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
      .then((principal) => active && setRole(principal.role))
      .catch(() => active && setRole(null));
    return () => {
      active = false;
    };
  }, [configuredApiUrl, session?.access_token]);

  const refresh = useCallback(async () => {
    if (!session?.access_token || !configuredApiUrl || !canManage) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await listTikTokAccounts(configuredApiUrl, session.access_token);
      setAccounts(response.accounts);
    } catch {
      setAccounts([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [canManage, configuredApiUrl, session?.access_token]);

  useEffect(() => void refresh(), [refresh]);

  const connect = useCallback(async () => {
    if (!session?.access_token || !configuredApiUrl || !canManage) return;
    setStartError(false);
    setRedirecting(true);
    try {
      const response = await startTikTokConnection(configuredApiUrl, session.access_token);
      window.location.assign(response.authorizationUrl);
    } catch {
      setRedirecting(false);
      setStartError(true);
    }
  }, [canManage, configuredApiUrl, session?.access_token]);

  const dismissNotice = useCallback(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('tiktokConnectionStatus');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    setNotice(null);
  }, []);

  return {
    apiConfigured: configuredApiUrl !== null,
    signedIn: session !== null,
    canManage,
    accounts,
    notice,
    loading,
    redirecting,
    loadError,
    startError,
    refresh,
    connect,
    dismissNotice,
  };
}
