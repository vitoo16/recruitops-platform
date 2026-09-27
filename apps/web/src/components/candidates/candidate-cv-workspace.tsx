'use client';

import type { Session } from '@supabase/supabase-js';
import {
  PrivateFileUploadIntentSchema,
  RegisterCandidateDocumentSchema,
  type Candidate,
  type CandidateDocument,
  type PrivateFileUploadPolicy,
} from '@recruitops/contracts';
import { Download, FileText, RefreshCw, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { listCandidates } from '@/lib/candidates/api';
import { FilesApiError, listCandidateDocuments, registerCandidateDocument } from '@/lib/files/api';
import {
  PrivateFileAccessError,
  createPrivateDownloadUrl,
  uploadPrivateFile,
} from '@/lib/storage/private-files';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];

const CV_UPLOAD_POLICY: PrivateFileUploadPolicy = {
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxBytes: 10 * 1024 * 1024,
};

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function CandidateCvWorkspace() {
  const t = useTranslations('candidateCv');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configuredApiUrl = useMemo(apiUrl, []);
  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'RECRUITER';
  const canAdministerPrivateFiles = role === 'OWNER' || role === 'ADMIN';

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
        setDocuments([]);
        setCandidateId('');
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

    void Promise.all([
      fetch(`${configuredApiUrl}/auth/me`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error('principal_failed');
        return PrincipalSchema.parse(await response.json());
      }),
      listCandidates(configuredApiUrl, session.access_token),
    ])
      .then(([principal, candidateResponse]) => {
        if (!active) return;
        setRole(principal.role);
        setCandidates(candidateResponse.items);
        setCandidateId((current) => current || candidateResponse.items[0]?.id || '');
      })
      .catch(() => {
        if (active) setError(t('loadFailed'));
      });

    return () => {
      active = false;
    };
  }, [configuredApiUrl, session, t]);

  async function loadDocuments(nextCandidateId = candidateId) {
    if (!session?.access_token || !configuredApiUrl || !nextCandidateId || !canManage) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDocuments(
        await listCandidateDocuments(configuredApiUrl, session.access_token, nextCandidateId),
      );
    } catch (caught) {
      setDocuments([]);
      setError(
        caught instanceof FilesApiError && caught.status === 403 ? t('forbidden') : t('loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (candidateId && canManage) void loadDocuments(candidateId);
    else setDocuments([]);
    // Reload only when candidate/role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, canManage]);

  async function uploadCv() {
    if (!session?.access_token || !configuredApiUrl || !candidateId || !file || !canManage) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(t('storageUnavailable'));
      return;
    }

    setUploading(true);
    setError(null);
    const objectId = crypto.randomUUID();
    const intentResult = PrivateFileUploadIntentSchema.safeParse({
      purpose: 'CANDIDATE_CV',
      ownerUserId: session.user.id,
      ownerEntityId: candidateId,
      objectId,
      originalFileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!intentResult.success) {
      setUploading(false);
      setError(t('invalidFile'));
      return;
    }

    try {
      const uploaded = await uploadPrivateFile({
        client: supabase,
        intent: intentResult.data,
        policy: CV_UPLOAD_POLICY,
        file,
      });
      const registration = RegisterCandidateDocumentSchema.parse({
        candidateId,
        kind: 'CV',
        storageKey: uploaded.objectKey,
        originalFileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await registerCandidateDocument(configuredApiUrl, session.access_token, registration);
      setFile(null);
      const input = document.getElementById('candidate-cv-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadDocuments(candidateId);
    } catch (caught) {
      if (caught instanceof PrivateFileAccessError) {
        setError(
          caught.message.includes('MIME_TYPE_NOT_ALLOWED')
            ? t('invalidFileType')
            : t('uploadFailed'),
        );
      } else if (caught instanceof FilesApiError && caught.status === 403) {
        setError(t('forbidden'));
      } else {
        setError(t('uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(item: CandidateDocument) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) return;
    setError(null);
    try {
      const url = await createPrivateDownloadUrl({
        client: supabase,
        objectKey: item.storageKey,
        expiresInSeconds: 300,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError(t('downloadOwnershipBoundary'));
    }
  }

  if (!configuredApiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }
  if (!session) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }
  if (role === 'VIEWER') {
    return (
      <section className="rounded-2xl border bg-white p-6" aria-labelledby="candidate-cv-title">
        <h2 id="candidate-cv-title" className="text-xl font-semibold">
          {t('title')}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">{t('viewerRestricted')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="candidate-cv-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h2 id="candidate-cv-title" className="mt-1 text-2xl font-semibold tracking-tight">
            {t('title')}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">{t('description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading || !candidateId}
          onClick={() => void loadDocuments()}
        >
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          {t('refresh')}
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border bg-white p-6">
          <label className="text-sm font-medium" htmlFor="candidate-cv-owner">
            {t('candidate')}
          </label>
          <select
            id="candidate-cv-owner"
            className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={candidateId}
            onChange={(event) => {
              setCandidateId(event.target.value);
              setFile(null);
            }}
          >
            <option value="">{t('chooseCandidate')}</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
              </option>
            ))}
          </select>

          <label className="mt-5 block text-sm font-medium" htmlFor="candidate-cv-file">
            {t('file')}
          </label>
          <input
            id="candidate-cv-file"
            className="mt-2 block w-full text-sm file:mr-4 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="mt-2 text-xs leading-5 text-neutral-500">{t('fileHint')}</p>
          {file ? (
            <p className="mt-3 text-sm text-neutral-600">
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}
          <Button
            className="mt-5 w-full"
            type="button"
            disabled={!candidateId || !file || uploading}
            onClick={() => void uploadCv()}
          >
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {uploading ? t('uploading') : t('uploadAction')}
          </Button>
        </div>

        <div className="space-y-3" aria-live="polite" aria-busy={loading}>
          {loading ? <p className="text-sm text-neutral-500">{t('loading')}</p> : null}
          {!loading && documents.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-500">
              {t('empty')}
            </div>
          ) : null}
          {documents.map((item) => {
            const ownedByCurrentUser = item.storageKey.startsWith(`${session.user.id}/`);
            const canDownload = ownedByCurrentUser || canAdministerPrivateFiles;
            return (
              <article key={item.id} className="rounded-2xl border bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0" aria-hidden="true" />
                      <p className="truncate font-medium">{item.originalFileName}</p>
                    </div>
                    <p className="mt-2 text-sm text-neutral-500">
                      {item.mimeType} · {formatBytes(item.sizeBytes)}
                    </p>
                  </div>
                  {canDownload ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void downloadDocument(item)}
                    >
                      <Download className="mr-2 size-4" aria-hidden="true" />
                      {t('download')}
                    </Button>
                  ) : (
                    <p className="max-w-xs text-xs leading-5 text-neutral-500">{t('otherOwner')}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
