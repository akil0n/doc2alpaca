import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeChinesePhone } from "@/lib/phone";
import { sendTencentSms } from "@/lib/tencentSms";
import {
  decryptJson,
  encryptJson,
  hashOtp,
  privacyHash,
  safeEqualHex,
} from "@/lib/serverCrypto";

const OTP_TTL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function smsEnvironment() {
  const values = {
    secretId: process.env.TENCENTCLOUD_SECRET_ID,
    secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    region: process.env.TENCENT_SMS_REGION || "ap-guangzhou",
    appId: process.env.TENCENT_SMS_SDK_APP_ID,
    signName: process.env.TENCENT_SMS_SIGN_NAME,
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID,
  };
  if (
    !values.secretId ||
    !values.secretKey ||
    !values.appId ||
    !values.signName ||
    !values.templateId
  ) {
    throw new Error("SMS service is not configured");
  }
  return values as Record<keyof typeof values, string>;
}

async function sendSms(phone: string, code: string): Promise<void> {
  const env = smsEnvironment();
  await sendTencentSms(
    {
      secretId: env.secretId,
      secretKey: env.secretKey,
      region: env.region,
      appId: env.appId,
      signName: env.signName,
      templateId: env.templateId,
    },
    phone,
    [code, String(OTP_TTL_MS / 60_000)]
  );
}

async function consumeOtpLimit(
  id: string,
  max: number,
  expiresAt: Date
): Promise<boolean> {
  const row = await prisma.otpRateLimit.upsert({
    where: { id },
    create: { id, count: 1, expiresAt },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count <= max;
}

export async function requestPhoneOtp(
  rawPhone: string,
  requestIp: string
): Promise<void> {
  const phone = normalizeChinesePhone(rawPhone);
  if (!phone) throw new Error("INVALID_PHONE");
  const phoneHash = privacyHash(phone, "phone");
  const requestIpHash = privacyHash(requestIp || "unknown", "request-ip");
  const now = Date.now();
  const hour = Math.floor(now / (60 * 60_000));
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`otp:${phoneHash}`}))`;
    const cooldown = await tx.otpCooldown.findUnique({ where: { id: phoneHash } });
    if (cooldown && cooldown.nextAllowedAt.getTime() > now) {
      throw new Error("OTP_COOLDOWN");
    }
    await tx.otpCooldown.upsert({
      where: { id: phoneHash },
      create: { id: phoneHash, nextAllowedAt: new Date(now + COOLDOWN_MS) },
      update: { nextAllowedAt: new Date(now + COOLDOWN_MS) },
    });
  });
  const [phoneHourAllowed, ipHourAllowed] = await Promise.all([
    consumeOtpLimit(`phone-hour:${phoneHash}:${hour}`, MAX_PER_HOUR, new Date(now + 2 * 60 * 60_000)),
    consumeOtpLimit(`ip-hour:${requestIpHash}:${hour}`, MAX_PER_HOUR * 4, new Date(now + 2 * 60 * 60_000)),
  ]);
  if (!phoneHourAllowed || !ipHourAllowed) throw new Error("OTP_RATE_LIMIT");
  prisma.otpRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

  const challengeId = crypto.randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const encryptedPhone = encryptJson({ phone }, `phone-challenge:${challengeId}`);
  await prisma.phoneChallenge.create({
    data: {
      id: challengeId,
      phoneHash,
      phoneCipher: JSON.stringify(encryptedPhone),
      requestIpHash,
      codeHash: hashOtp(challengeId, code),
      expiresAt: new Date(now + OTP_TTL_MS),
    },
  });

  try {
    await sendSms(phone, code);
  } catch (error) {
    await prisma.phoneChallenge.delete({ where: { id: challengeId } }).catch(() => {});
    throw error;
  }
}

export async function verifyPhoneOtp(
  rawPhone: string,
  code: string
): Promise<{ id: string; name: string; phone: string } | null> {
  const phone = normalizeChinesePhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(code)) return null;
  const phoneHash = privacyHash(phone, "phone");
  const challenge = await prisma.phoneChallenge.findFirst({
    where: {
      phoneHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return null;

  const attempted = await prisma.phoneChallenge.updateMany({
    where: {
      id: challenge.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  if (attempted.count !== 1) return null;
  if (!safeEqualHex(hashOtp(challenge.id, code), challenge.codeHash)) return null;

  const claimed = await prisma.phoneChallenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  const stored = decryptJson<{ phone: string }>(
    JSON.parse(challenge.phoneCipher),
    `phone-challenge:${challenge.id}`
  );
  if (stored.phone !== phone) return null;

  const existing = await prisma.user.findUnique({ where: { phoneHash } });
  if (existing) {
    await prisma.phoneChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
    return { id: existing.id, name: existing.name || "手机用户", phone };
  }

  const id = crypto.randomUUID();
  const phoneCipher = JSON.stringify(
    encryptJson({ phone }, `user:${id}:phone`)
  );
  const user = await prisma.user.upsert({
    where: { phoneHash },
    create: { id, phoneHash, phoneCipher, name: "手机用户" },
    update: {},
  });
  await prisma.phoneChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
  return { id: user.id, name: user.name || "手机用户", phone };
}
