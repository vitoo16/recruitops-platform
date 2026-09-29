'use client';

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  listThreadsAccounts,
  startThreadsConnection,
  type ThreadsConnectedAccount,
} from '@/lib/threads-connections/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
export type ThreadsConnectionNotice = 'connected' | 'denied' | null;

function configuredApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

function readReturnNotice(): ThreadsConnectionNotice {
  if (typeof window === 'undefined') return null;
  const status = new URL(window.location.href).searchParams.get('threadsConnectionStatus');
  return status === 'connected' || status === 'denied' ? status : null;
}

function clearReturnNotice(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('threadsConnectionStatus');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function useThreadsConnection() {
  const apiUrl = useMemo(configuredApiUrl, []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [accounts, setAccounts] = useState<readonly ThreadsConnectedAccount[]>([]);
  const [notice, setNotice] = useState<ThreadsConnectionNotice>(readReturnNotice);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [startError, setStartError] = useState(false);

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
        setAccounts([]);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || !apiUrl) return;
    let active = true;

    void fetch(`${apiUrl}/auth/me`, {
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
  }, [apiUrl, session?.access_token]);

  const refresh = useCallback(async () => {
    if (!session?.access_token || !apiUrl || !canManage) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await listThreadsAccounts(apiUrl, session.access_token);
      setAccounts(response.accounts);
    } catch {
      setAccounts([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, canManage, session?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (notice !== 'connected' || !canManage) return;
    void refresh();
  }, [canManage, notice, refresh]);

  const connect = useCallback(async () => {
    if (!session?.access_token || !apiUrl || !canManage) return;
    setStartError(false);
    setRedirecting(true);
    try {
      const response = await startThreadsConnection(apiUrl, session.access_token);
      window.location.assign(response.authorizationUrl);
    } catch {
      setRedirecting(false);
      setStartError(true);
    }
  }, [apiUrl, canManage, session?.access_token]);

  const dismissNotice = useCallback(() => {
    clearReturnNotice();
    setNotice(null);
  }, []);

  return {
    apiConfigured: apiUrl !== null,
    signedIn: session !== null,
    canManage,
    accounts,
    notice,
    loading,
    redirecting,
    loadError,
    startError,
    connect,
    refresh,
    dismissNotice,
  };
}
