'use client';

import type { Session } from '@supabase/supabase-js';
import {
  CreateJobSchema,
  JobListResponseSchema,
  type EmploymentType,
  type Job,
  type JobStatus,
} from '@recruitops/contracts';
import { BriefcaseBusiness, Plus, RefreshCw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createJob, JobsApiError, listJobs, updateJobStatus } from '@/lib/jobs/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
type JobForm = {
  title: string;
  companyName: string;
  description: string;
  location: string;
  employmentType: EmploymentType;
};

const employmentTypes: EmploymentType[] = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'FREELANCE',
  'OTHER',
];
const statuses: JobStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED'];

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

export function JobHub() {
  const t = useTranslations('jobs');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<JobForm>({
    defaultValues: {
      title: '',
      companyName: '',
      description: '',
      location: '',
      employmentType: 'FULL_TIME',
    },
  });

  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'RECRUITER';
  const configuredApiUrl = useMemo(apiUrl, []);

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

  async function load(nextSearch = search) {
    if (!session?.access_token || !configuredApiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const response = JobListResponseSchema.parse(
        await listJobs(configuredApiUrl, session.access_token, nextSearch),
      );
      setJobs(response.items);
    } catch {
      setError(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session?.access_token && configuredApiUrl) void load('');
    // Loading is intentionally tied only to authenticated session/config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredApiUrl, session?.access_token]);

  async function onCreate(values: JobForm) {
    if (!session?.access_token || !configuredApiUrl) return;
    setError(null);

    const payload = CreateJobSchema.safeParse({
      ...values,
      location: values.location.trim() || undefined,
    });
    if (!payload.success) {
      setError(t('invalidForm'));
      return;
    }

    try {
      await createJob(configuredApiUrl, session.access_token, payload.data);
      form.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof JobsApiError && caught.status === 403 ? t('forbidden') : t('saveFailed'));
    }
  }

  async function changeStatus(job: Job, status: JobStatus) {
    if (!session?.access_token || !configuredApiUrl || status === job.status) return;
    setError(null);
    try {
      const updated = await updateJobStatus(
        configuredApiUrl,
        session.access_token,
        job.id,
        status,
      );
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof JobsApiError && caught.status === 403 ? t('forbidden') : t('saveFailed'));
    }
  }

  if (!configuredApiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }

  if (!session) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }

  return (
    <section className="space-y-6" aria-labelledby="job-hub-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h2 id="job-hub-title" className="mt-1 text-2xl font-semibold tracking-tight">
            {t('title')}
          </h2>
        </div>
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load(search);
          }}
        >
          <label className="sr-only" htmlFor="job-search">
            {t('searchLabel')}
          </label>
          <Input
            id="job-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
          <Button type="submit" variant="outline" disabled={loading} aria-label={t('searchAction')}>
            <Search className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} aria-label={t('refresh')}>
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.8fr]">
        {canMutate ? (
          <form className="space-y-4 rounded-2xl border bg-white p-6" onSubmit={form.handleSubmit(onCreate)} noValidate>
            <div className="flex items-center gap-2">
              <Plus className="size-4" aria-hidden="true" />
              <h3 className="font-semibold">{t('createTitle')}</h3>
            </div>
            <Field label={t('jobTitle')} htmlFor="job-title">
              <Input id="job-title" required {...form.register('title')} />
            </Field>
            <Field label={t('company')} htmlFor="job-company">
              <Input id="job-company" required {...form.register('companyName')} />
            </Field>
            <Field label={t('location')} htmlFor="job-location">
              <Input id="job-location" {...form.register('location')} />
            </Field>
            <Field label={t('employmentType')} htmlFor="job-employment-type">
              <select
                id="job-employment-type"
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                {...form.register('employmentType')}
              >
                {employmentTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`employment.${type}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('description')} htmlFor="job-description">
              <textarea
                id="job-description"
                className="min-h-28 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                required
                {...form.register('description')}
              />
            </Field>
            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('saving') : t('createAction')}
            </Button>
          </form>
        ) : (
          <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-600">{t('readOnly')}</div>
        )}

        <div className="space-y-3" aria-live="polite" aria-busy={loading}>
          {loading ? <p className="text-sm text-neutral-500">{t('loading')}</p> : null}
          {!loading && jobs.length === 0 ? (
            <p className="rounded-2xl border bg-white p-6 text-sm text-neutral-500">{t('empty')}</p>
          ) : null}
          {jobs.map((job) => (
            <article key={job.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness className="size-4 shrink-0" aria-hidden="true" />
                    <h3 className="truncate font-semibold">{job.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600">
                    {job.companyName}
                    {job.location ? ` · ${job.location}` : ''}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-500">{job.description}</p>
                </div>
                <div className="shrink-0">
                  <label className="sr-only" htmlFor={`job-status-${job.id}`}>
                    {t('statusLabel', { title: job.title })}
                  </label>
                  <select
                    id={`job-status-${job.id}`}
                    className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
                    value={job.status}
                    disabled={!canMutate}
                    onChange={(event) => void changeStatus(job, event.target.value as JobStatus)}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
