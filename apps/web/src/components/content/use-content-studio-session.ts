'use client';

import type { Session } from '@supabase/supabase-js';
import type { Job } from '@recruitops/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { listJobs } from '@/lib/jobs/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { configuredApiUrl } from './content-studio-utils';
import {
  ContentStudioPrincipalSchema,
  type ContentStudioErrorReporter,
  type ContentStudioRole,
} from './content-studio-types';

export function useContentStudioSession(reportError: ContentStudioErrorReporter) {
  const t = useTranslations('contentMedia');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<ContentStudioRole | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [defaultJobId, setDefaultJobId] = useState('');
  const apiUrl = useMemo(configuredApiUrl, []);

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
        setJobs([]);
        setDefaultJobId('');
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

    void Promise.all([
      fetch(`${apiUrl}/auth/me`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error('principal_failed');
        return ContentStudioPrincipalSchema.parse(await response.json());
      }),
      listJobs(apiUrl, session.access_token),
    ])
      .then(([principal, jobResponse]) => {
        if (!active) return;
        setRole(principal.role);
        setJobs(jobResponse.items);
        setDefaultJobId(jobResponse.items[0]?.id ?? '');
      })
      .catch(() => {
        if (active) reportError(t('loadFailed'));
      });

    return () => {
      active = false;
    };
  }, [apiUrl, reportError, session, t]);

  return {
    session,
    role,
    jobs,
    defaultJobId,
    apiUrl,
    canMutate: role === 'OWNER' || role === 'ADMIN' || role === 'RECRUITER',
  };
}
