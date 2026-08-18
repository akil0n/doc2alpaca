-- DropTable: OTP 验证码、频控、冷却已迁移到 Redis，不再需要这些表
DROP TABLE IF EXISTS "OtpCooldown";
DROP TABLE IF EXISTS "OtpRateLimit";
DROP TABLE IF EXISTS "PhoneChallenge";
