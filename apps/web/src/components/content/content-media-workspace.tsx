'use client';

import { useTranslations } from 'next-intl';
import { MediaWorkspacePanel } from './media-workspace-panel';
import { PostDraftPanel } from './post-draft-panel';
import { PostVariantMediaPanel } from './post-variant-media-panel';
import { PublicationSchedulePanel } from './publication-schedule-panel';
import { PublicationStatusPanel } from './publication-status-panel';
import { PublishNowPanel } from './publish-now-panel';
import { useContentStudio } from './use-content-studio';

export function ContentMediaWorkspace() {
  const t = useTranslations('contentMedia');
  const studio = useContentStudio();

  if (!studio.apiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }
  if (!studio.session) {
    return <p className="text-sm text-[var(--content-secondary)]">{t('signInRequired')}</p>;
  }

  return (
    <section className="space-y-6" aria-labelledby="content-media-title">
      <header>
        <p className="text-sm font-medium text-[var(--content-secondary)]">{t('eyebrow')}</p>
        <h2
          id="content-media-title"
          className="mt-1 text-2xl font-semibold tracking-tight text-balance"
        >
          {t('title')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--content-secondary)]">
          {t('description')}
        </p>
      </header>

      {studio.error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
          aria-live="polite"
        >
          {studio.error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <PostDraftPanel
          jobs={studio.jobs}
          posts={studio.posts}
          postId={studio.postId}
          loadingPosts={studio.loadingPosts}
          canMutate={studio.canMutate}
          form={studio.form}
          onPostChange={studio.setPostId}
          onCreateDraft={studio.onCreateDraft}
        />
        <MediaWorkspacePanel
          postId={studio.postId}
          assets={studio.assets}
          file={studio.file}
          fileInputVersion={studio.fileInputVersion}
          altText={studio.altText}
          loading={studio.loadingAssets}
          uploading={studio.uploading}
          canMutate={studio.canMutate}
          onFileChange={studio.setFile}
          onAltTextChange={studio.setAltText}
          onRefresh={() => void studio.loadAssets()}
          onUpload={() => void studio.uploadMedia()}
        />
      </div>

      <PostVariantMediaPanel
        postId={studio.postId}
        platform={studio.platform}
        variantText={studio.variantText}
        variantHashtags={studio.variantHashtags}
        variantLink={studio.variantLink}
        hasPersistedVariant={Boolean(studio.selectedVariant)}
        assets={studio.assets}
        selectedMediaIds={studio.selectedMediaIds}
        loading={studio.loadingVariants}
        savingVariant={studio.savingVariant}
        savingSelection={studio.savingSelection}
        canMutate={studio.canMutate}
        onPlatformChange={studio.setPlatform}
        onVariantTextChange={studio.setVariantText}
        onVariantHashtagsChange={studio.setVariantHashtags}
        onVariantLinkChange={studio.setVariantLink}
        onSaveVariant={() => void studio.saveVariant()}
        onToggleMedia={studio.toggleSelectedMedia}
        onMoveMedia={studio.moveSelectedMedia}
        onSaveSelection={() => void studio.saveMediaSelection()}
      />

      <PublishNowPanel
        postVariantId={studio.selectedVariant?.id ?? null}
        readiness={studio.publishReadiness}
        destinationId={studio.publishDestinationId}
        loadingReadiness={studio.loadingPublishReadiness}
        readinessError={studio.publishReadinessError}
        publishing={studio.publishingNow}
        publishErrorStatus={studio.publishNowErrorStatus}
        result={studio.publishNowResult}
        canMutate={studio.canMutate}
        onDestinationChange={studio.setPublishDestinationId}
        onRefreshReadiness={() => void studio.loadPublishReadiness()}
        onPublishNow={() => void studio.queuePublishNow()}
      />

      <PublicationSchedulePanel
        postVariantId={studio.selectedVariant?.id ?? null}
        readiness={studio.publishReadiness}
        statuses={studio.publicationStatuses}
        statusesTruncated={studio.publicationStatusesTruncated}
        destinationId={studio.scheduleDestinationId}
        scheduleDate={studio.scheduleDate}
        scheduleTime={studio.scheduleTime}
        timeZone={studio.scheduleTimeZone}
        minimumDate={studio.minimumScheduleDate}
        scheduling={studio.schedulingPublication}
        validationError={studio.scheduleValidationError}
        errorStatus={studio.scheduleErrorStatus}
        result={studio.scheduleResult}
        canSchedule={studio.canSchedule}
        canMutate={studio.canMutate}
        onDestinationChange={studio.setScheduleDestinationId}
        onDateChange={studio.setScheduleDate}
        onTimeChange={studio.setScheduleTime}
        onSchedule={() => void studio.schedulePublication()}
      />

      <PublicationStatusPanel
        postVariantId={studio.selectedVariant?.id ?? null}
        items={studio.publicationStatuses}
        truncated={studio.publicationStatusesTruncated}
        loading={studio.loadingPublicationStatuses}
        loadError={studio.publicationStatusLoadError}
        retryingPublicationId={studio.retryingPublicationId}
        retryErrorId={studio.publicationRetryErrorId}
        retryAcceptance={studio.publicationRetryAcceptance}
        canMutate={studio.canMutate}
        onRefresh={() => void studio.loadPublicationStatuses()}
        onRetry={(publicationId) => void studio.retryPublication(publicationId)}
      />
    </section>
  );
}
