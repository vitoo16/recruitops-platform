import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CandidatesController } from '../candidates/candidates.controller.js';
import { FilesController } from '../files/files.controller.js';
import type { AppRole } from './auth.types.js';
import { ROLES_KEY } from './roles.decorator.js';

const piiManagers: AppRole[] = ['OWNER', 'ADMIN', 'RECRUITER'];
const authenticatedReaders: AppRole[] = ['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER'];

function rolesFor(handler: (...args: never[]) => unknown): AppRole[] {
  return (Reflect.getMetadata(ROLES_KEY, handler) as AppRole[] | undefined) ?? [];
}

describe('candidate PII authorization matrix', () => {
  it.each([
    ['listCandidates', CandidatesController.prototype.listCandidates],
    ['getCandidateById', CandidatesController.prototype.getCandidateById],
    ['listApplications', CandidatesController.prototype.listApplications],
    ['getApplicationById', CandidatesController.prototype.getApplicationById],
  ] as const)('%s remains readable only by authenticated application roles', (_name, handler) => {
    expect(rolesFor(handler)).toEqual(authenticatedReaders);
  });

  it.each([
    ['findDuplicateSignals', CandidatesController.prototype.findDuplicateSignals],
    ['createCandidate', CandidatesController.prototype.createCandidate],
    ['updateCandidate', CandidatesController.prototype.updateCandidate],
    ['createApplication', CandidatesController.prototype.createApplication],
    ['updateApplicationStatus', CandidatesController.prototype.updateApplicationStatus],
  ] as const)('%s excludes VIEWER from sensitive matching or mutation', (_name, handler) => {
    expect(rolesFor(handler)).toEqual(piiManagers);
    expect(rolesFor(handler)).not.toContain('VIEWER');
  });

  it('keeps candidate CV metadata unavailable to VIEWER', () => {
    expect(rolesFor(FilesController.prototype.registerCandidateDocument)).toEqual(piiManagers);
    expect(rolesFor(FilesController.prototype.listCandidateDocuments)).toEqual(piiManagers);
    expect(rolesFor(FilesController.prototype.listCandidateDocuments)).not.toContain('VIEWER');
  });
});
