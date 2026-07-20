import { createHash, createHmac } from "node:crypto";

interface TencentSmsConfig {
  secretId: string;
  secretKey: string;
  region: string;
  appId: string;
  signName: string;
  templateId: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function utcDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export function createTencentSmsRequest(
  config: TencentSmsConfig,
  phone: string,
  templateParams: string[],
  timestamp = Math.floor(Date.now() / 1000)
): { headers: Record<string, string>; body: string } {
  const service = "sms";
  const host = "sms.tencentcloudapi.com";
  const action = "SendSms";
  const contentType = "application/json; charset=utf-8";
  const body = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: config.appId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: templateParams,
  });
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");

  const date = utcDate(timestamp);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    body,
    headers: {
      Authorization:
        `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": contentType,
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": "2021-01-11",
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": config.region,
    },
  };
}

export async function sendTencentSms(
  config: TencentSmsConfig,
  phone: string,
  templateParams: string[]
): Promise<void> {
  const request = createTencentSmsRequest(config, phone, templateParams);
  const response = await fetch("https://sms.tencentcloudapi.com", {
    method: "POST",
    headers: request.headers,
    body: request.body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json()) as {
    Response?: {
      Error?: { Code?: string };
      SendStatusSet?: Array<{ Code?: string }>;
    };
  };
  const status = data.Response?.SendStatusSet?.[0];
  if (!response.ok || data.Response?.Error || status?.Code !== "Ok") {
    throw new Error(`SMS delivery rejected: ${data.Response?.Error?.Code || status?.Code || "unknown"}`);
  }
}
