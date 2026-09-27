import { z } from 'zod';
import { SocialPlatformSchema } from './content.js';

export const applicationStatusValues = [
  'SOURCED',
  'SUBMITTED',
  'INTERVIEW_INVITED',
  'INTERVIEWED',
  'REJECTED',
  'HIRED',
  'WORKING',
  'WORKED_30_DAYS',
  'WITHDRAWN',
] as const;

export const ApplicationStatusSchema = z.enum(applicationStatusValues);
export const CandidateIdSchema = z.uuid();
export const ApplicationIdSchema = z.uuid();

const emailSchema = z.string().trim().email().max(254).optional();
const phoneSchema = z.string().trim().min(7).max(32).optional();
const nullableEmailSchema = z.string().email().max(254).nullable();
const nullablePhoneSchema = z.string().min(7).max(32).nullable();

const candidateWriteShape = {
  fullName: z.string().trim().min(2).max(160),
  email: emailSchema,
  phone: phoneSchema,
};

export const CreateCandidateSchema = z.object(candidateWriteShape).superRefine((value, context) => {
  if (!value.email && !value.phone) {
    context.addIssue({
      code: 'custom',
      path: ['email'],
      message: 'At least one contact method (email or phone) is required',
    });
  }
});

export const UpdateCandidateSchema = z
  .object({
    fullName: candidateWriteShape.fullName.optional(),
    email: z.union([z.string().trim().email().max(254), z.null()]).optional(),
    phone: z.union([z.string().trim().min(7).max(32), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const CandidateSchema = z.object({
  id: CandidateIdSchema,
  fullName: z.string(),
  email: nullableEmailSchema,
  phone: nullablePhoneSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const CandidateListQuerySchema = z.object({
  search: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const CandidateListResponseSchema = z.object({
  items: z.array(CandidateSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const CreateApplicationSchema = z.object({
  candidateId: CandidateIdSchema,
  jobId: z.uuid(),
  status: ApplicationStatusSchema.default('SOURCED'),
  sourcePlatform: SocialPlatformSchema.optional(),
  sourceDestinationId: z.uuid().optional(),
  sourceLabel: z.string().trim().min(1).max(255).optional(),
});

export const ApplicationSchema = z.object({
  id: ApplicationIdSchema,
  candidateId: CandidateIdSchema,
  jobId: z.uuid(),
  status: ApplicationStatusSchema,
  sourcePlatform: SocialPlatformSchema.nullable(),
  sourceDestinationId: z.uuid().nullable(),
  sourceLabel: z.string().nullable(),
  sourcedAt: z.iso.datetime({ offset: true }),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  interviewAt: z.iso.datetime({ offset: true }).nullable(),
  hiredAt: z.iso.datetime({ offset: true }).nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  worked30DaysAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const ApplicationListQuerySchema = z.object({
  candidateId: CandidateIdSchema.optional(),
  jobId: z.uuid().optional(),
  status: ApplicationStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const ApplicationListResponseSchema = z.object({
  items: z.array(ApplicationSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const UpdateApplicationStatusSchema = z.object({
  status: ApplicationStatusSchema,
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export const CandidateDuplicateSignalQuerySchema = z
  .object({
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), 'Email or phone is required');

export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type CandidateListQuery = z.infer<typeof CandidateListQuerySchema>;
export type CandidateListResponse = z.infer<typeof CandidateListResponseSchema>;
export type CreateCandidateInput = z.infer<typeof CreateCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof UpdateCandidateSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type ApplicationListQuery = z.infer<typeof ApplicationListQuerySchema>;
export type ApplicationListResponse = z.infer<typeof ApplicationListResponseSchema>;
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof UpdateApplicationStatusSchema>;
export type CandidateDuplicateSignalQuery = z.infer<typeof CandidateDuplicateSignalQuerySchema>;

const applicationTransitions: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  SOURCED: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['INTERVIEW_INVITED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW_INVITED: ['INTERVIEWED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEWED: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  HIRED: ['WORKING', 'WITHDRAWN'],
  WORKING: ['WORKED_30_DAYS', 'WITHDRAWN'],
  WORKED_30_DAYS: [],
  WITHDRAWN: [],
};

export function canTransitionApplicationStatus(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return from === to || applicationTransitions[from].includes(to);
}

export function normalizeCandidateEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeCandidatePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  return hasLeadingPlus ? `+${digits}` : digits;
}

export function buildCandidateDedupeKeys(input: {
  email?: string | undefined;
  phone?: string | undefined;
}): string[] {
  const keys: string[] = [];

  if (input.email) {
    keys.push(`email:${normalizeCandidateEmail(input.email)}`);
  }

  if (input.phone) {
    const normalizedPhone = normalizeCandidatePhone(input.phone);
    if (normalizedPhone) keys.push(`phone:${normalizedPhone}`);
  }

  return [...new Set(keys)];
}
