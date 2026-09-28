import { z } from 'zod';

const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
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

const PublicationWorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().trim().min(1),
  REDIS_URL: z.string().trim().min(1),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().trim().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().trim().min(1).default('recruitops-private'),
  PROVIDER_MEDIA_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(7_200).default(3_600),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type SupabaseAuthEnv = z.infer<typeof SupabaseAuthEnvSchema>;
export type MetaOAuthEnv = z.infer<typeof MetaOAuthEnvSchema>;
export type PublicationWorkerEnv = z.infer<typeof PublicationWorkerEnvSchema>;

export function parseApiEnv(input: Record<string, string | undefined>): ApiEnv {
  return ApiEnvSchema.parse(input);
}

export function parseSupabaseAuthEnv(input: Record<string, string | undefined>): SupabaseAuthEnv {
  return SupabaseAuthEnvSchema.parse(input);
}

export function parseMetaOAuthEnv(input: Record<string, string | undefined>): MetaOAuthEnv {
  return MetaOAuthEnvSchema.parse(input);
}

export function parsePublicationWorkerEnv(
  input: Record<string, string | undefined>,
): PublicationWorkerEnv {
  return PublicationWorkerEnvSchema.parse(input);
}
