import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CandidateDocument,
  MediaAsset,
  RegisterCandidateDocumentInput,
  RegisterMediaAssetInput,
} from '@recruitops/contracts';
import type {
  CandidateDocument as DatabaseCandidateDocument,
  MediaAsset as DatabaseMediaAsset,
} from '@recruitops/database';
import { DatabaseService } from '../database/database.service.js';

function safeFileSize(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new InternalServerErrorException({
      code: 'UNSAFE_FILE_SIZE',
      message: 'Stored file size exceeds the API safe-integer range',
    });
  }
  return number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function mapDatabaseMediaAsset(asset: DatabaseMediaAsset): MediaAsset {
  return {
    id: asset.id,
    postId: asset.postId,
    kind: asset.kind,
    storageKey: asset.storageKey,
    originalFileName: asset.originalFileName,
    mimeType: asset.mimeType,
    sizeBytes: safeFileSize(asset.sizeBytes),
    checksumSha256: asset.checksumSha256,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    altText: asset.altText,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function mapDatabaseCandidateDocument(
  document: DatabaseCandidateDocument,
): CandidateDocument {
  return {
    id: document.id,
    candidateId: document.candidateId,
    applicationId: document.applicationId,
    kind: document.kind,
    storageKey: document.storageKey,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    sizeBytes: safeFileSize(document.sizeBytes),
    checksumSha256: document.checksumSha256,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

@Injectable()
export class FilesRepository {
  constructor(private readonly database: DatabaseService) {}

  async registerMediaAsset(input: RegisterMediaAssetInput): Promise<MediaAsset> {
    const post = await this.database.client.post.findUnique({
      where: { id: input.postId },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post was not found' });
    }

    try {
      const asset = await this.database.client.mediaAsset.create({
        data: {
          postId: input.postId,
          kind: input.kind,
          storageKey: input.storageKey,
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          ...(input.checksumSha256 !== undefined
            ? { checksumSha256: input.checksumSha256.toLowerCase() }
            : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
          ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
          ...(input.altText !== undefined ? { altText: input.altText } : {}),
        },
      });
      return mapDatabaseMediaAsset(asset);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'STORAGE_KEY_ALREADY_REGISTERED',
          message: 'The uploaded object is already registered',
        });
      }
      throw error;
    }
  }

  async listMediaAssets(postId: string): Promise<MediaAsset[]> {
    const rows = await this.database.client.mediaAsset.findMany({
      where: { postId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapDatabaseMediaAsset);
  }

  async registerCandidateDocument(
    input: RegisterCandidateDocumentInput,
  ): Promise<CandidateDocument> {
    const [candidate, application] = await Promise.all([
      this.database.client.candidate.findUnique({
        where: { id: input.candidateId },
        select: { id: true },
      }),
      input.applicationId
        ? this.database.client.application.findUnique({
            where: { id: input.applicationId },
            select: { id: true, candidateId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!candidate) {
      throw new NotFoundException({
        code: 'CANDIDATE_NOT_FOUND',
        message: 'Candidate was not found',
      });
    }
    if (input.applicationId && !application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application was not found',
      });
    }
    if (application && application.candidateId !== input.candidateId) {
      throw new ConflictException({
        code: 'APPLICATION_CANDIDATE_MISMATCH',
        message: 'Application does not belong to the supplied candidate',
      });
    }

    try {
      const document = await this.database.client.candidateDocument.create({
        data: {
          candidateId: input.candidateId,
          kind: input.kind,
          storageKey: input.storageKey,
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          ...(input.applicationId !== undefined ? { applicationId: input.applicationId } : {}),
          ...(input.checksumSha256 !== undefined
            ? { checksumSha256: input.checksumSha256.toLowerCase() }
            : {}),
        },
      });
      return mapDatabaseCandidateDocument(document);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'STORAGE_KEY_ALREADY_REGISTERED',
          message: 'The uploaded object is already registered',
        });
      }
      throw error;
    }
  }

  async listCandidateDocuments(candidateId: string): Promise<CandidateDocument[]> {
    const rows = await this.database.client.candidateDocument.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapDatabaseCandidateDocument);
  }
}
