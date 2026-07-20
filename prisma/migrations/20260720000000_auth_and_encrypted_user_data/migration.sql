-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "phoneHash" TEXT,
    "phoneCipher" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateTable
CREATE TABLE "PhoneChallenge" (
    "id" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "phoneCipher" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "requestIpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLlmConfig" (
    "userId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLlmConfig_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GeneratedHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "fileType" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "isBatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRateLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpRateLimit" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyLlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCooldown" (
    "id" TEXT NOT NULL,
    "nextAllowedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpCooldown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneHash_key" ON "User"("phoneHash");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE INDEX "PhoneChallenge_phoneHash_createdAt_idx" ON "PhoneChallenge"("phoneHash", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneChallenge_requestIpHash_createdAt_idx" ON "PhoneChallenge"("requestIpHash", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneChallenge_expiresAt_idx" ON "PhoneChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "GeneratedHistory_userId_createdAt_idx" ON "GeneratedHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserRateLimit_expiresAt_idx" ON "UserRateLimit"("expiresAt");

-- CreateIndex
CREATE INDEX "UserRateLimit_userId_action_idx" ON "UserRateLimit"("userId", "action");

-- CreateIndex
CREATE INDEX "OtpRateLimit_expiresAt_idx" ON "OtpRateLimit"("expiresAt");

-- CreateIndex
CREATE INDEX "DailyLlmUsage_userId_day_idx" ON "DailyLlmUsage"("userId", "day");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLlmConfig" ADD CONSTRAINT "UserLlmConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedHistory" ADD CONSTRAINT "GeneratedHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRateLimit" ADD CONSTRAINT "UserRateLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLlmUsage" ADD CONSTRAINT "DailyLlmUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
