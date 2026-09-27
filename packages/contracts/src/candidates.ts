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

const emailSchema = z.string().trim().email().max(254).optional();
const phoneSchema = z.string().trim().min(7).max(32).optional();

export const CreateCandidateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    email: emailSchema,
    phone: phoneSchema,
  })
  .superRefine((value, context) => {
    if (!value.email && !value.phone) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'At least one contact method (email or phone) is required',
      });
    }
  });

export const CreateApplicationSchema = z.object({
  candidateId: z.uuid(),
  jobId: z.uuid(),
  status: ApplicationStatusSchema.default('SOURCED'),
  sourcePlatform: SocialPlatformSchema.optional(),
  sourceDestinationId: z.uuid().optional(),
  sourceLabel: z.string().trim().min(1).max(255).optional(),
});

export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export type CreateCandidateInput = z.infer<typeof CreateCandidateSchema>;
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;

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

export function canTransitionApplicationStatus(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
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
