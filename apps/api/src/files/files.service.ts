import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  PrivateFileEntityIdSchema,
  RegisterCandidateDocumentSchema,
  RegisterMediaAssetSchema,
  objectKeyBelongsToEntity,
  type CandidateDocument,
  type MediaAsset,
} from '@recruitops/contracts';
import { parseRequest } from '../common/zod-request.js';
import { FilesRepository } from './files.repository.js';

@Injectable()
export class FilesService {
  constructor(private readonly files: FilesRepository) {}

  async registerMediaAsset(userId: string, input: unknown): Promise<MediaAsset> {
    const parsed = parseRequest(RegisterMediaAssetSchema, input);
    if (!objectKeyBelongsToEntity(parsed.storageKey, userId, 'media', parsed.postId)) {
      throw new ForbiddenException({
        code: 'STORAGE_KEY_OWNERSHIP_MISMATCH',
        message: 'Storage key does not belong to the authenticated user and post',
      });
    }
    return this.files.registerMediaAsset(parsed);
  }

  async listMediaAssets(postId: unknown): Promise<MediaAsset[]> {
    return this.files.listMediaAssets(parseRequest(PrivateFileEntityIdSchema, postId));
  }

  async registerCandidateDocument(userId: string, input: unknown): Promise<CandidateDocument> {
    const parsed = parseRequest(RegisterCandidateDocumentSchema, input);
    if (!objectKeyBelongsToEntity(parsed.storageKey, userId, 'candidates', parsed.candidateId)) {
      throw new ForbiddenException({
        code: 'STORAGE_KEY_OWNERSHIP_MISMATCH',
        message: 'Storage key does not belong to the authenticated user and candidate',
      });
    }
    return this.files.registerCandidateDocument(parsed);
  }

  async listCandidateDocuments(candidateId: unknown): Promise<CandidateDocument[]> {
    return this.files.listCandidateDocuments(parseRequest(PrivateFileEntityIdSchema, candidateId));
  }
}
