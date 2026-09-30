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
export const JobIdSchema = z.uuid();

const optionalMoneyMinor = z.number().int().nonnegative().safe().optional();
const optionalCurrency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .optional();

const JobFieldsSchema = z.object({
  title: z.string().trim().min(2).max(160),
  companyName: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(20_000),
  location: z.string().trim().max(160).optional(),
  employmentType: EmploymentTypeSchema,
  status: JobStatusSchema,
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  salaryMinMinor: optionalMoneyMinor,
  salaryMaxMinor: optionalMoneyMinor,
  interviewCommissionMinor: optionalMoneyMinor,
  worked30DaysCommissionMinor: optionalMoneyMinor,
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

export const CreateJobSchema = JobFieldsSchema.omit({ status: true, currency: true })
  .extend({
    status: JobStatusSchema.default('DRAFT'),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default('VND'),
  })
  .superRefine(validateSalaryRange);

export const UpdateJobSchema = JobFieldsSchema.partial()
  .extend({ currency: optionalCurrency })
  .superRefine(validateSalaryRange)
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

export const JobListQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  employmentType: EmploymentTypeSchema.optional(),
  search: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const JobSchema = z.object({
  id: JobIdSchema,
  title: z.string(),
  companyName: z.string(),
  description: z.string(),
  location: z.string().nullable(),
  employmentType: EmploymentTypeSchema,
  status: JobStatusSchema,
  currency: z.string().length(3),
  salaryMinMinor: z.number().int().nonnegative().safe().nullable(),
  salaryMaxMinor: z.number().int().nonnegative().safe().nullable(),
  interviewCommissionMinor: z.number().int().nonnegative().safe().nullable(),
  worked30DaysCommissionMinor: z.number().int().nonnegative().safe().nullable(),
  sourceRef: z.string().nullable(),
  commissionNote: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const JobListResponseSchema = z.object({
  items: z.array(JobSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;
export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;
export type JobListQuery = z.infer<typeof JobListQuerySchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobListResponse = z.infer<typeof JobListResponseSchema>;
