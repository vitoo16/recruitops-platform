import { z } from 'zod';

const CorsOriginSchema = z
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'CORS origins must use http or https',
      });
    }

    if (url.username || url.password) {
      context.addIssue({
        code: 'custom',
        message: 'CORS origins must not contain credentials',
      });
    }

    if (url.pathname !== '/' || url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        message: 'CORS origins must not contain a path, query string, or fragment',
      });
    }
  })
  .transform((value) => new URL(value).origin);

const CorsOriginsSchema = z
  .string()
  .default('http://localhost:3000')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(CorsOriginSchema).min(1).max(20))
  .superRefine((origins, context) => {
    if (new Set(origins).size !== origins.length) {
      context.addIssue({
        code: 'custom',
        message: 'CORS origins must be unique',
      });
    }
  });

const ApiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).optional(),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    CORS_ORIGINS: CorsOriginsSchema,
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === 'production' &&
      value.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Production CORS origins must use https',
      });
    }
  });

const SupabaseAuthEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const MetaOAuthEnvSchema = z.object({
  META_CLIENT_ID: z.string().trim().min(1),
  META_CLIENT_SECRET: z.string().trim().min(1),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/),
  META_REDIRECT_URI: z.url(),
  META_FRONTEND_REDIRECT_URI: z.url(),
});

const ThreadsOAuthEnvSchema = z.object({
  THREADS_CLIENT_ID: z.string().trim().min(1),
  THREADS_CLIENT_SECRET: z.string().trim().min(1),
  THREADS_REDIRECT_URI: z.url(),
  THREADS_FRONTEND_REDIRECT_URI: z.url(),
});

const LinkedInOAuthEnvSchema = z.object({
  LINKEDIN_CLIENT_ID: z.string().trim().min(1),
  LINKEDIN_CLIENT_SECRET: z.string().trim().min(1),
  LINKEDIN_REDIRECT_URI: z.url(),
  LINKEDIN_FRONTEND_REDIRECT_URI: z.url(),
});

const TikTokOAuthEnvSchema = z.object({
  TIKTOK_CLIENT_KEY: z.string().trim().min(1),
  TIKTOK_CLIENT_SECRET: z.string().trim().min(1),
  TIKTOK_REDIRECT_URI: z.url(),
  TIKTOK_FRONTEND_REDIRECT_URI: z.url(),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type SupabaseAuthEnv = z.infer<typeof SupabaseAuthEnvSchema>;
export type MetaOAuthEnv = z.infer<typeof MetaOAuthEnvSchema>;
export type ThreadsOAuthEnv = z.infer<typeof ThreadsOAuthEnvSchema>;
export type LinkedInOAuthEnv = z.infer<typeof LinkedInOAuthEnvSchema>;
export type TikTokOAuthEnv = z.infer<typeof TikTokOAuthEnvSchema>;

export function parseApiEnv(input: Record<string, string | undefined>): ApiEnv {
  return ApiEnvSchema.parse(input);
}

export function parseSupabaseAuthEnv(input: Record<string, string | undefined>): SupabaseAuthEnv {
  return SupabaseAuthEnvSchema.parse(input);
}

export function parseMetaOAuthEnv(input: Record<string, string | undefined>): MetaOAuthEnv {
  return MetaOAuthEnvSchema.parse(input);
}

export function parseThreadsOAuthEnv(input: Record<string, string | undefined>): ThreadsOAuthEnv {
  return ThreadsOAuthEnvSchema.parse(input);
}

export function parseLinkedInOAuthEnv(input: Record<string, string | undefined>): LinkedInOAuthEnv {
  return LinkedInOAuthEnvSchema.parse(input);
}

export function parseTikTokOAuthEnv(input: Record<string, string | undefined>): TikTokOAuthEnv {
  return TikTokOAuthEnvSchema.parse(input);
}
