'use client';

import type { MediaAsset } from '@recruitops/contracts';
import { FileImage, RefreshCw, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBytes } from './content-studio-utils';

interface MediaWorkspacePanelProps {
  postId: string;
  assets: MediaAsset[];
  file: File | null;
  fileInputVersion: number;
  altText: string;
  loading: boolean;
  uploading: boolean;
  canMutate: boolean;
  onFileChange(file: File | null): void;
  onAltTextChange(value: string): void;
  onRefresh(): void;
  onUpload(): void;
}

export function MediaWorkspacePanel({
  postId,
  assets,
  file,
  fileInputVersion,
  altText,
  loading,
  uploading,
  canMutate,
  onFileChange,
  onAltTextChange,
  onRefresh,
  onUpload,
}: MediaWorkspacePanelProps) {
  const t = useTranslations('contentMedia');

  return (
    <section className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-pretty">{t('mediaFile')}</h3>
        <Button
          type="button"
          variant="outline"
          className="size-11 px-0"
          disabled={!postId || loading}
          aria-label={t('refreshMedia')}
          onClick={onRefresh}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {canMutate ? (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium" htmlFor="content-media-file">
            {t('mediaFile')}
          </label>
          <input
            key={fileInputVersion}
            id="content-media-file"
            name="contentMediaFile"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            className="block min-h-11 w-full text-sm file:mr-4 file:min-h-11 file:rounded-md file:border file:bg-[var(--surface-panel)] file:px-3 file:py-2 file:text-sm file:font-medium"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs leading-5 text-[var(--content-secondary)]">{t('mediaHint')}</p>
          <label className="block text-sm font-medium" htmlFor="content-media-alt">
            {t('altText')}
          </label>
          <Input
            id="content-media-alt"
            name="contentMediaAlt"
            className="h-11"
            autoComplete="off"
            value={altText}
            maxLength={500}
            onChange={(event) => onAltTextChange(event.target.value)}
          />
          {file ? (
            <p className="break-words text-sm text-[var(--content-secondary)]">
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}
          <Button
            className="min-h-11 w-full"
            type="button"
            disabled={!postId || !file || uploading}
            onClick={onUpload}
          >
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {uploading ? t('uploading') : t('uploadAction')}
          </Button>
        </div>
      ) : null}

      <div className="mt-6 space-y-3 border-t pt-6" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p className="text-sm text-[var(--content-secondary)]">{t('loadingMedia')}</p>
        ) : null}
        {!loading && postId && assets.length === 0 ? (
          <p className="text-sm text-[var(--content-secondary)]">{t('emptyMedia')}</p>
        ) : null}
        {!postId ? (
          <p className="text-sm text-[var(--content-secondary)]">{t('selectPost')}</p>
        ) : null}
        {assets.map((asset) => (
          <article key={asset.id} className="rounded-xl border bg-[var(--surface-subtle)] p-4">
            <div className="flex items-start gap-3">
              <FileImage className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate font-medium">{asset.originalFileName}</p>
                <p className="mt-1 text-sm text-[var(--content-secondary)]">
                  {t(`kind.${asset.kind}`)} · {formatBytes(asset.sizeBytes)}
                </p>
                {asset.altText ? (
                  <p className="mt-2 break-words text-sm leading-6 text-[var(--content-secondary)]">
                    {asset.altText}
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
