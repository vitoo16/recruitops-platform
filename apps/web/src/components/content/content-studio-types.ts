import { z } from 'zod';

export const ContentStudioPrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

export type ContentStudioRole = z.infer<typeof ContentStudioPrincipalSchema>['role'];

export type ContentStudioPostForm = {
  jobId: string;
  title: string;
  baseContent: string;
  language: 'vi' | 'en';
};

export type ContentStudioErrorReporter = (message: string | null) => void;
