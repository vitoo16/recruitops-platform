import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { FilesRepository } from './files.repository.js';
import { FilesService } from './files.service.js';

const userId = '550e8400-e29b-41d4-a716-446655440001';
const postId = '550e8400-e29b-41d4-a716-446655440002';
const candidateId = '550e8400-e29b-41d4-a716-446655440003';
const objectId = '550e8400-e29b-41d4-a716-446655440004';

describe('FilesService', () => {
  it('rejects media metadata claiming another user namespace', async () => {
    const repository = { registerMediaAsset: vi.fn() } as unknown as FilesRepository;
    const service = new FilesService(repository);

    await expect(
      service.registerMediaAsset(userId, {
        postId,
        kind: 'IMAGE',
        storageKey: `550e8400-e29b-41d4-a716-446655440099/media/${postId}/${objectId}.png`,
        originalFileName: 'job.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.registerMediaAsset).not.toHaveBeenCalled();
  });

  it('accepts candidate document metadata only inside the authenticated candidate namespace', async () => {
    const document = {
      id: objectId,
      candidateId,
      applicationId: null,
      kind: 'CV' as const,
      storageKey: `${userId}/candidates/${candidateId}/${objectId}.pdf`,
      originalFileName: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      checksumSha256: null,
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z',
    };
    const repository = {
      registerCandidateDocument: vi.fn().mockResolvedValue(document),
    } as unknown as FilesRepository;
    const service = new FilesService(repository);

    await expect(
      service.registerCandidateDocument(userId, {
        candidateId,
        storageKey: document.storageKey,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
      }),
    ).resolves.toEqual(document);
    expect(repository.registerCandidateDocument).toHaveBeenCalledOnce();
  });
});
