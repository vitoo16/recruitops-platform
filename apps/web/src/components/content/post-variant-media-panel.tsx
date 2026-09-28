'use client';

import { socialPlatformValues, type MediaAsset, type SocialPlatform } from '@recruitops/contracts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PostVariantMediaPanelProps {
  postId: string;
  platform: SocialPlatform;
  variantText: string;
  variantHashtags: string;
  variantLink: string;
  hasPersistedVariant: boolean;
  assets: MediaAsset[];
  selectedMediaIds: string[];
  loading: boolean;
  savingVariant: boolean;
  savingSelection: boolean;
  canMutate: boolean;
  onPlatformChange(platform: SocialPlatform): void;
  onVariantTextChange(value: string): void;
  onVariantHashtagsChange(value: string): void;
  onVariantLinkChange(value: string): void;
  onSaveVariant(): void;
  onToggleMedia(mediaAssetId: string): void;
  onMoveMedia(mediaAssetId: string, direction: -1 | 1): void;
  onSaveSelection(): void;
}

export function PostVariantMediaPanel({
  postId,
  platform,
  variantText,
  variantHashtags,
  variantLink,
  hasPersistedVariant,
  assets,
  selectedMediaIds,
  loading,
  savingVariant,
  savingSelection,
  canMutate,
  onPlatformChange,
  onVariantTextChange,
  onVariantHashtagsChange,
  onVariantLinkChange,
  onSaveVariant,
  onToggleMedia,
  onMoveMedia,
  onSaveSelection,
}: PostVariantMediaPanelProps) {
  const t = useTranslations('contentStudio');
  const selectedAssets = selectedMediaIds
    .map((id) => assets.find((asset) => asset.id === id))
    .filter((asset): asset is MediaAsset => Boolean(asset));

  return (
    <section
      className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]"
      aria-labelledby="platform-variant-title"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-[var(--content-secondary)]">{t('eyebrow')}</p>
          <h3 id="platform-variant-title" className="mt-1 text-xl font-semibold text-pretty">
            {t('title')}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--content-secondary)]">
            {t('description')}
          </p>
        </div>
        <div className="w-full md:w-56">
          <label className="text-sm font-medium" htmlFor="variant-platform">
            {t('platform')}
          </label>
          <select
            id="variant-platform"
            translate="no"
            className="mt-2 h-11 w-full rounded-md border bg-[var(--surface-panel)] px-3 text-sm"
            value={platform}
            disabled={!postId || loading}
            onChange={(event) => onPlatformChange(event.target.value as SocialPlatform)}
          >
            {socialPlatformValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!postId ? (
        <p className="mt-6 rounded-xl border bg-[var(--surface-subtle)] p-4 text-sm text-[var(--content-secondary)]">
          {t('choosePost')}
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="variant-text">
                {t('variantText')}
              </label>
              <textarea
                id="variant-text"
                name="variantText"
                className="mt-2 min-h-40 w-full rounded-md border bg-[var(--surface-panel)] px-3 py-2 text-sm leading-6"
                autoComplete="off"
                value={variantText}
                disabled={!canMutate}
                onChange={(event) => onVariantTextChange(event.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="variant-hashtags">
                  {t('hashtags')}
                </label>
                <Input
                  id="variant-hashtags"
                  name="variantHashtags"
                  autoComplete="off"
                  placeholder={t('hashtagsPlaceholder')}
                  value={variantHashtags}
                  disabled={!canMutate}
                  onChange={(event) => onVariantHashtagsChange(event.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="variant-link">
                  {t('link')}
                </label>
                <Input
                  id="variant-link"
                  name="variantLink"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder={t('linkPlaceholder')}
                  value={variantLink}
                  disabled={!canMutate}
                  onChange={(event) => onVariantLinkChange(event.target.value)}
                />
              </div>
            </div>
            {canMutate ? (
              <Button type="button" disabled={savingVariant} onClick={onSaveVariant}>
                {savingVariant ? t('savingVariant') : t('saveVariant')}
              </Button>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold">{t('mediaSelection')}</h4>
              <p className="mt-1 text-sm leading-6 text-[var(--content-secondary)]">
                {hasPersistedVariant ? t('mediaSelectionHint') : t('saveVariantFirst')}
              </p>
            </div>

            {hasPersistedVariant ? (
              <>
                {selectedAssets.length > 0 ? (
                  <ol className="space-y-2" aria-label={t('selectedOrder')}>
                    {selectedAssets.map((asset, index) => (
                      <li
                        key={asset.id}
                        className="flex min-w-0 items-center gap-3 rounded-xl border bg-[var(--surface-subtle)] p-3"
                      >
                        <span className="w-6 shrink-0 text-center text-sm tabular-nums text-[var(--content-secondary)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {asset.originalFileName}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className="size-11 shrink-0 px-0"
                          disabled={!canMutate || index === 0}
                          aria-label={t('moveUp', { name: asset.originalFileName })}
                          onClick={() => onMoveMedia(asset.id, -1)}
                        >
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="size-11 shrink-0 px-0"
                          disabled={!canMutate || index === selectedAssets.length - 1}
                          aria-label={t('moveDown', { name: asset.originalFileName })}
                          onClick={() => onMoveMedia(asset.id, 1)}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-xl border bg-[var(--surface-subtle)] p-4 text-sm text-[var(--content-secondary)]">
                    {t('emptySelection')}
                  </p>
                )}

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{t('availableMedia')}</legend>
                  {assets.length === 0 ? (
                    <p className="text-sm text-[var(--content-secondary)]">{t('noMedia')}</p>
                  ) : null}
                  {assets.map((asset) => (
                    <label
                      key={asset.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-[var(--surface-subtle)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"
                    >
                      <input
                        type="checkbox"
                        name="variantMedia"
                        className="size-4"
                        checked={selectedMediaIds.includes(asset.id)}
                        disabled={!canMutate}
                        onChange={() => onToggleMedia(asset.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{asset.originalFileName}</span>
                    </label>
                  ))}
                </fieldset>

                {canMutate ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingSelection}
                    onClick={onSaveSelection}
                  >
                    {savingSelection ? t('savingSelection') : t('saveSelection')}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
