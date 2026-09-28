-- Explicit ordered media selection for platform-specific post variants.
-- Domain data remains API-owned; browser roles must not access this join table directly.

CREATE TABLE public.post_variant_media_assets (
    "postVariantId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "post_variant_media_assets_pkey" PRIMARY KEY ("postVariantId", "mediaAssetId"),
    CONSTRAINT "post_variant_media_assets_position_nonnegative" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "post_variant_media_assets_postVariantId_position_key"
    ON public.post_variant_media_assets ("postVariantId", "position");
CREATE INDEX "post_variant_media_assets_mediaAssetId_idx"
    ON public.post_variant_media_assets ("mediaAssetId");

ALTER TABLE public.post_variant_media_assets
    ADD CONSTRAINT "post_variant_media_assets_postVariantId_fkey"
    FOREIGN KEY ("postVariantId") REFERENCES public.post_variants(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.post_variant_media_assets
    ADD CONSTRAINT "post_variant_media_assets_mediaAssetId_fkey"
    FOREIGN KEY ("mediaAssetId") REFERENCES public.media_assets(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.post_variant_media_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.post_variant_media_assets FROM anon, authenticated;
