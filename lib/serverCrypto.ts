import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function encryptionKey(): Buffer {
  const encoded = process.env.DATA_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("DATA_ENCRYPTION_KEY is required");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function encryptJson(value: unknown, associatedData: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function decryptJson<T>(
  value: EncryptedValue,
  associatedData: string
): T {
  if (value.keyVersion !== 1) throw new Error("Unsupported encryption key version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64")
  );
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function pepper(): string {
  const value = process.env.AUTH_SECRET || process.env.OTP_PEPPER;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return value;
}

export function privacyHash(value: string, purpose: string): string {
  return createHmac("sha256", pepper())
    .update(purpose)
    .update("\0")
    .update(value)
    .digest("hex");
}

export function hashOtp(challengeId: string, code: string): string {
  return privacyHash(`${challengeId}\0${code}`, "phone-otp");
}

export function safeEqualHex(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function redactSecret(message: string, secret: string): string {
  if (!secret) return message;
  return message.replaceAll(secret, "[REDACTED]");
}

export function shortFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
