-- Secure OAuth credential storage foundation.
-- OAuth access/refresh tokens are encrypted by the server before reaching PostgreSQL.

CREATE TABLE "social_credentials" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_credentials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_credentials_platform_idx" ON "social_credentials"("platform");
CREATE INDEX "social_credentials_keyId_idx" ON "social_credentials"("keyId");
CREATE UNIQUE INDEX "social_accounts_credentialRef_key" ON "social_accounts"("credentialRef");

ALTER TABLE "social_accounts"
ADD CONSTRAINT "social_accounts_credentialRef_fkey"
FOREIGN KEY ("credentialRef") REFERENCES "social_credentials"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- The table lives in public for Prisma compatibility but is API-owned.
-- No anon/authenticated policy is created, so browser Data API access fails closed.
ALTER TABLE public.social_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.social_credentials FROM anon, authenticated;
