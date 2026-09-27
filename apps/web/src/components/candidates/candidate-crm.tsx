'use client';

import type { Session } from '@supabase/supabase-js';
import {
  CreateApplicationSchema,
  CreateCandidateSchema,
  applicationStatusValues,
  canTransitionApplicationStatus,
  type Application,
  type ApplicationStatus,
  type Candidate,
  type Job,
} from '@recruitops/contracts';
import { Plus, RefreshCw, Search, UserRound, Workflow } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CandidatesApiError,
  createApplication,
  createCandidate,
  listApplications,
  listCandidates,
  updateApplicationStatus,
} from '@/lib/candidates/api';
import { listJobs } from '@/lib/jobs/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
type CandidateForm = { fullName: string; email: string; phone: string };
type ApplicationForm = { jobId: string };

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

export function CandidateCrm() {
  const t = useTranslations('candidates');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidateForm = useForm<CandidateForm>({
    defaultValues: { fullName: '', email: '', phone: '' },
  });
  const applicationForm = useForm<ApplicationForm>({ defaultValues: { jobId: '' } });
  const configuredApiUrl = useMemo(apiUrl, []);
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'RECRUITER';
  const selectedCandidate = candidates.find((item) => item.id === selectedCandidateId) ?? null;

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
        setCandidates([]);
        setApplications([]);
        setSelectedCandidateId(null);
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

  async function loadCandidates(nextSearch = search) {
    if (!session?.access_token || !configuredApiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const [candidateResponse, jobResponse] = await Promise.all([
        listCandidates(configuredApiUrl, session.access_token, nextSearch),
        listJobs(configuredApiUrl, session.access_token),
      ]);
      setCandidates(candidateResponse.items);
      setJobs(jobResponse.items);
      setSelectedCandidateId((current) => {
        if (current && candidateResponse.items.some((item) => item.id === current)) return current;
        return candidateResponse.items[0]?.id ?? null;
      });
    } catch {
      setError(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadApplications(candidateId: string) {
    if (!session?.access_token || !configuredApiUrl) return;
    setApplicationLoading(true);
    setError(null);
    try {
      const response = await listApplications(configuredApiUrl, session.access_token, candidateId);
      setApplications(response.items);
    } catch {
      setApplications([]);
      setError(t('applicationLoadFailed'));
    } finally {
      setApplicationLoading(false);
    }
  }

  useEffect(() => {
    if (session?.access_token && configuredApiUrl) void loadCandidates('');
    // Loading is intentionally tied only to authenticated session/config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredApiUrl, session?.access_token]);

  useEffect(() => {
    if (selectedCandidateId) void loadApplications(selectedCandidateId);
    else setApplications([]);
    // Application loading follows candidate selection only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidateId]);

  async function onCreateCandidate(values: CandidateForm) {
    if (!session?.access_token || !configuredApiUrl) return;
    setError(null);
    const payload = CreateCandidateSchema.safeParse({
      fullName: values.fullName,
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
    });
    if (!payload.success) {
      setError(t('invalidCandidate'));
      return;
    }

    try {
      const created = await createCandidate(configuredApiUrl, session.access_token, payload.data);
      candidateForm.reset();
      await loadCandidates();
      setSelectedCandidateId(created.id);
    } catch (caught) {
      setError(
        caught instanceof CandidatesApiError && caught.status === 403
          ? t('forbidden')
          : t('saveFailed'),
      );
    }
  }

  async function onCreateApplication(values: ApplicationForm) {
    if (!session?.access_token || !configuredApiUrl || !selectedCandidateId) return;
    setError(null);
    const payload = CreateApplicationSchema.safeParse({
      candidateId: selectedCandidateId,
      jobId: values.jobId,
      status: 'SOURCED',
    });
    if (!payload.success) {
      setError(t('invalidApplication'));
      return;
    }

    try {
      await createApplication(configuredApiUrl, session.access_token, payload.data);
      applicationForm.reset();
      await loadApplications(selectedCandidateId);
    } catch (caught) {
      setError(
        caught instanceof CandidatesApiError && caught.status === 403
          ? t('forbidden')
          : t('saveFailed'),
      );
    }
  }

  async function changeApplicationStatus(application: Application, status: ApplicationStatus) {
    if (!session?.access_token || !configuredApiUrl || status === application.status) return;
    setError(null);
    try {
      const updated = await updateApplicationStatus(
        configuredApiUrl,
        session.access_token,
        application.id,
        status,
      );
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(
        caught instanceof CandidatesApiError && caught.status === 403
          ? t('forbidden')
          : t('saveFailed'),
      );
    }
  }

  if (!configuredApiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }
  if (!session) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }

  return (
    <section className="space-y-6" aria-labelledby="candidate-crm-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h2 id="candidate-crm-title" className="mt-1 text-2xl font-semibold tracking-tight">
            {t('title')}
          </h2>
        </div>
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void loadCandidates(search);
          }}
        >
          <label className="sr-only" htmlFor="candidate-search">
            {t('searchLabel')}
          </label>
          <Input
            id="candidate-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
          <Button type="submit" variant="outline" disabled={loading} aria-label={t('searchAction')}>
            <Search className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadCandidates()}
            aria-label={t('refresh')}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="space-y-4">
          {canMutate ? (
            <form
              className="space-y-4 rounded-2xl border bg-white p-6"
              onSubmit={candidateForm.handleSubmit(onCreateCandidate)}
              noValidate
            >
              <div className="flex items-center gap-2">
                <Plus className="size-4" aria-hidden="true" />
                <h3 className="font-semibold">{t('createCandidate')}</h3>
              </div>
              <Field label={t('fullName')} htmlFor="candidate-name">
                <Input id="candidate-name" required {...candidateForm.register('fullName')} />
              </Field>
              <Field label={t('email')} htmlFor="candidate-email">
                <Input id="candidate-email" type="email" {...candidateForm.register('email')} />
              </Field>
              <Field label={t('phone')} htmlFor="candidate-phone">
                <Input id="candidate-phone" {...candidateForm.register('phone')} />
              </Field>
              <p className="text-xs leading-5 text-neutral-500">{t('contactHint')}</p>
              <Button className="w-full" type="submit" disabled={candidateForm.formState.isSubmitting}>
                {candidateForm.formState.isSubmitting ? t('saving') : t('createAction')}
              </Button>
            </form>
          ) : null}

          <div className="space-y-2" aria-live="polite" aria-busy={loading}>
            {loading ? <p className="text-sm text-neutral-500">{t('loading')}</p> : null}
            {!loading && candidates.length === 0 ? (
              <p className="rounded-2xl border bg-white p-5 text-sm text-neutral-500">{t('empty')}</p>
            ) : null}
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedCandidateId === candidate.id
                    ? 'border-neutral-900 bg-neutral-50'
                    : 'bg-white hover:bg-neutral-50'
                }`}
                onClick={() => setSelectedCandidateId(candidate.id)}
              >
                <div className="flex items-center gap-2">
                  <UserRound className="size-4" aria-hidden="true" />
                  <span className="font-medium">{candidate.fullName}</span>
                </div>
                <p className="mt-2 text-sm text-neutral-500">
                  {[candidate.email, candidate.phone].filter(Boolean).join(' · ') || t('noContact')}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!selectedCandidate ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-500">
              {t('selectCandidate')}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-white p-6">
                <p className="text-sm text-neutral-500">{t('selectedCandidate')}</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedCandidate.fullName}</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  {[selectedCandidate.email, selectedCandidate.phone].filter(Boolean).join(' · ') ||
                    t('noContact')}
                </p>
              </div>

              {canMutate ? (
                <form
                  className="flex flex-col gap-3 rounded-2xl border bg-white p-6 sm:flex-row sm:items-end"
                  onSubmit={applicationForm.handleSubmit(onCreateApplication)}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="text-sm font-medium" htmlFor="candidate-job">
                      {t('job')}
                    </label>
                    <select
                      id="candidate-job"
                      className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                      required
                      {...applicationForm.register('jobId')}
                    >
                      <option value="">{t('chooseJob')}</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title} · {job.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" disabled={applicationForm.formState.isSubmitting}>
                    <Workflow className="mr-2 size-4" aria-hidden="true" />
                    {t('createApplication')}
                  </Button>
                </form>
              ) : (
                <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600">
                  {t('readOnly')}
                </div>
              )}

              <div className="space-y-3" aria-live="polite" aria-busy={applicationLoading}>
                {applicationLoading ? (
                  <p className="text-sm text-neutral-500">{t('loadingApplications')}</p>
                ) : null}
                {!applicationLoading && applications.length === 0 ? (
                  <p className="rounded-2xl border bg-white p-6 text-sm text-neutral-500">
                    {t('noApplications')}
                  </p>
                ) : null}
                {applications.map((application) => {
                  const job = jobs.find((item) => item.id === application.jobId);
                  const availableStatuses = applicationStatusValues.filter((status) =>
                    canTransitionApplicationStatus(application.status, status),
                  );
                  return (
                    <article key={application.id} className="rounded-2xl border bg-white p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{job?.title ?? t('unknownJob')}</p>
                          <p className="mt-1 text-sm text-neutral-500">
                            {job?.companyName ?? application.jobId}
                          </p>
                        </div>
                        <div>
                          <label className="sr-only" htmlFor={`application-status-${application.id}`}>
                            {t('statusLabel')}
                          </label>
                          <select
                            id={`application-status-${application.id}`}
                            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
                            value={application.status}
                            disabled={!canMutate}
                            onChange={(event) =>
                              void changeApplicationStatus(
                                application,
                                event.target.value as ApplicationStatus,
                              )
                            }
                          >
                            {availableStatuses.map((status) => (
                              <option key={status} value={status}>
                                {t(`status.${status}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
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
