import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureRedis, redis } from "@/lib/redis";
import { normalizeChinesePhone } from "@/lib/phone";
import { sendTencentSms } from "@/lib/tencentSms";
import { developmentOtpEnabled } from "@/lib/authProviderConfig";
import {
  decryptJson,
  encryptJson,
  hashOtp,
  privacyHash,
  safeEqualHex,
} from "@/lib/serverCrypto";

const OTP_TTL_S = 5 * 60;
const COOLDOWN_S = 60;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function smsEnvironment(): Record<
  "secretId" | "secretKey" | "region" | "appId" | "signName" | "templateId",
  string
> | null {
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
    return null;
  }
  return values as Record<keyof typeof values, string>;
}

/**
 * 投递验证码。
 * - 配置了腾讯短信：真实发送。
 * - 未配置 + 开发环境：不发送，返回验证码（便于本地手机号登录）。
 * - 未配置 + 生产环境：抛错，拒绝发放。
 */
async function deliverCode(
  phone: string,
  code: string,
): Promise<{ devCode?: string }> {
  const env = smsEnvironment();
  if (env) {
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
      [code, String(OTP_TTL_S / 60)],
    );
    return {};
  }
  if (!developmentOtpEnabled()) {
    throw new Error("SMS service is not configured");
  }
  return { devCode: code };
}

/**
 * 固定窗口频控：Lua 将 INCR 与首次 EXPIRE 放在同一个 Redis 原子操作中。
 * 返回 true 表示未超限。
 */
async function consumeLimit(
  key: string,
  max: number,
  ttlS: number,
): Promise<boolean> {
  const result = await redis.eval(
    `
      local count = redis.call("INCR", KEYS[1])
      if count == 1 then
        redis.call("EXPIRE", KEYS[1], ARGV[1])
      end
      return count
    `,
    { keys: [key], arguments: [String(ttlS)] },
  );
  const count = Number(result);
  return count <= max;
}

async function deleteChallengeIfUnchanged(
  key: string,
  expectedValue: string,
): Promise<boolean> {
  const deleted = await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    { keys: [key], arguments: [expectedValue] },
  );
  return Number(deleted) === 1;
}

export async function requestPhoneOtp(
  rawPhone: string,
  requestIp: string,
): Promise<string | undefined> {
  await ensureRedis();
  const phone = normalizeChinesePhone(rawPhone);
  if (!phone) throw new Error("INVALID_PHONE");
  const phoneHash = privacyHash(phone, "phone");
  const requestIpHash = privacyHash(requestIp || "unknown", "request-ip");
  const now = Date.now();
  const hour = Math.floor(now / (60 * 60_000));

  // 冷却：SET NX EX，已存在则视为仍在冷却期
  const cooldownSet = await redis.set(`otp:cooldown:${phoneHash}`, "1", {
    NX: true,
    EX: COOLDOWN_S,
  });
  if (!cooldownSet) throw new Error("OTP_COOLDOWN");

  const [phoneHourAllowed, ipHourAllowed] = await Promise.all([
    consumeLimit(
      `otp:limit:phone:${phoneHash}:${hour}`,
      MAX_PER_HOUR,
      2 * 60 * 60,
    ),
    consumeLimit(
      `otp:limit:ip:${requestIpHash}:${hour}`,
      MAX_PER_HOUR * 4,
      2 * 60 * 60,
    ),
  ]);
  if (!phoneHourAllowed || !ipHourAllowed) throw new Error("OTP_RATE_LIMIT");

  const challengeId = crypto.randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const encryptedPhone = encryptJson(
    { phone },
    `phone-challenge:${challengeId}`,
  );
  const challengeKey = `otp:ch:${phoneHash}`;
  const attemptsKey = `otp:at:${phoneHash}`;
  const challengeValue = JSON.stringify({
    challengeId,
    phoneCipher: JSON.stringify(encryptedPhone),
    codeHash: hashOtp(challengeId, code),
  });

  // MULTI/EXEC 保证新 challenge 与尝试次数重置同时完成，避免新验证码继承旧计数。
  await redis
    .multi()
    .set(challengeKey, challengeValue, { EX: OTP_TTL_S })
    .del(attemptsKey)
    .exec();

  let devCode: string | undefined;
  try {
    devCode = (await deliverCode(phone, code)).devCode;
  } catch (error) {
    await redis.del([challengeKey, attemptsKey]).catch(() => {});
    throw error;
  }
  return devCode;
}

export async function verifyPhoneOtp(
  rawPhone: string,
  code: string,
): Promise<{ id: string; name: string; phone: string } | null> {
  await ensureRedis();
  const phone = normalizeChinesePhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(code)) return null;
  const phoneHash = privacyHash(phone, "phone");

  // 尝试次数：INCR + EXPIRE，超限即作废当前 challenge
  const attempts = await redis.incr(`otp:at:${phoneHash}`);
  if (attempts === 1) await redis.expire(`otp:at:${phoneHash}`, OTP_TTL_S);
  if (attempts > MAX_ATTEMPTS) {
    await redis.del([`otp:ch:${phoneHash}`, `otp:at:${phoneHash}`]);
    return null;
  }

  const challengeKey = `otp:ch:${phoneHash}`;
  const raw = await redis.get(challengeKey);
  if (!raw) return null;

  let challenge: {
    challengeId: string;
    phoneCipher: string;
    codeHash: string;
  };
  try {
    const parsed = JSON.parse(raw) as Partial<typeof challenge> | null;
    if (
      !parsed ||
      typeof parsed.challengeId !== "string" ||
      typeof parsed.phoneCipher !== "string" ||
      typeof parsed.codeHash !== "string"
    ) {
      return null;
    }
    challenge = parsed as typeof challenge;
  } catch {
    return null;
  }
  if (!safeEqualHex(hashOtp(challenge.challengeId, code), challenge.codeHash)) {
    return null;
  }

  // 只有 Redis 中仍然是刚刚校验的 challenge 时才删除，避免误删刚被新请求替换的验证码。
  if (!(await deleteChallengeIfUnchanged(challengeKey, raw))) return null;
  await redis.del(`otp:at:${phoneHash}`);

  let stored: { phone: string };
  try {
    stored = decryptJson<{ phone: string }>(
      JSON.parse(challenge.phoneCipher),
      `phone-challenge:${challenge.challengeId}`,
    );
  } catch {
    return null;
  }
  if (stored.phone !== phone) return null;

  const existing = await prisma.user.findUnique({ where: { phoneHash } });
  if (existing) {
    return { id: existing.id, name: existing.name || "手机用户", phone };
  }

  const id = crypto.randomUUID();
  const phoneCipher = JSON.stringify(
    encryptJson({ phone }, `user:${id}:phone`),
  );
  const user = await prisma.user.upsert({
    where: { phoneHash },
    create: { id, phoneHash, phoneCipher, name: "手机用户" },
    update: {},
  });
  return { id: user.id, name: user.name || "手机用户", phone };
}
