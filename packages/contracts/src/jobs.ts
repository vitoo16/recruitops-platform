import { z } from 'zod';

export const jobStatusValues = ['DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED'] as const;
export const employmentTypeValues = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'FREELANCE',
  'OTHER',
] as const;

export const JobStatusSchema = z.enum(jobStatusValues);
export const EmploymentTypeSchema = z.enum(employmentTypeValues);

const optionalMoneyMinor = z.number().int().nonnegative().safe().optional();

const JobInputBaseSchema = z.object({
  title: z.string().trim().min(2).max(160),
  companyName: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(20_000),
  location: z.string().trim().max(160).optional(),
  employmentType: EmploymentTypeSchema,
  status: JobStatusSchema.default('DRAFT'),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default('VND'),
  salaryMinMinor: optionalMoneyMinor,
  salaryMaxMinor: optionalMoneyMinor,
  sourceRef: z.string().trim().max(500).optional(),
  commissionNote: z.string().trim().max(2_000).optional(),
});

type SalaryRangeInput = {
  salaryMinMinor?: number | undefined;
  salaryMaxMinor?: number | undefined;
};

function validateSalaryRange(value: SalaryRangeInput, context: z.RefinementCtx) {
  if (
    value.salaryMinMinor !== undefined &&
    value.salaryMaxMinor !== undefined &&
    value.salaryMaxMinor < value.salaryMinMinor
  ) {
    context.addIssue({
      code: 'custom',
      path: ['salaryMaxMinor'],
      message: 'salaryMaxMinor must be greater than or equal to salaryMinMinor',
    });
  }
}

export const CreateJobSchema = JobInputBaseSchema.superRefine(validateSalaryRange);
export const UpdateJobSchema = JobInputBaseSchema.partial().superRefine(validateSalaryRange);

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;
export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;
