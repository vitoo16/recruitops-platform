import type { PrivateFileUploadPolicy } from '@recruitops/contracts';

export const MEDIA_UPLOAD_POLICY: PrivateFileUploadPolicy = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
  maxBytes: 20 * 1024 * 1024,
};

export function configuredApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseHashtags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ];
}
