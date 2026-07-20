import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BUILTIN_ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "api.deepseek.com",
  "open.bigmodel.cn",
  "aip.baidubce.com",
  "dashscope.aliyuncs.com",
  "api.siliconflow.cn",
]);

interface EndpointPolicyOptions {
  allowedHosts?: string[];
  allowLocal?: boolean;
  resolver?: (hostname: string) => Promise<string[]>;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);

  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice(7));
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

export async function validateLLMBaseUrl(
  candidate: string,
  options: EndpointPolicyOptions = {}
): Promise<string> {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("LLM Base URL is invalid");
  }

  const hostname = url.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateAddress(hostname);

  if (isLocal && options.allowLocal) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Local LLM Base URL must use HTTP or HTTPS");
    }
  } else if (url.protocol !== "https:") {
    throw new Error("LLM Base URL must use HTTPS");
  }

  if (!isLocal && url.port && url.port !== "443") {
    throw new Error("Public LLM Base URL must use port 443");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("LLM Base URL must not contain credentials, query, or fragment");
  }

  const allowedHosts = new Set(BUILTIN_ALLOWED_HOSTS);
  for (const host of process.env.LLM_ALLOWED_HOSTS?.split(",") ?? []) {
    if (host.trim()) allowedHosts.add(host.trim().toLowerCase());
  }
  for (const host of options.allowedHosts ?? []) {
    if (host.trim()) allowedHosts.add(host.trim().toLowerCase());
  }

  if (!isLocal && !allowedHosts.has(hostname)) {
    throw new Error("LLM Base URL host is not approved");
  }
  if (isLocal && !options.allowLocal) {
    throw new Error("LLM Base URL must resolve to a public network");
  }

  const addresses = await (options.resolver ?? resolveAddresses)(hostname);
  if (
    addresses.length === 0 ||
    (!options.allowLocal && addresses.some(isPrivateAddress))
  ) {
    throw new Error("LLM Base URL must resolve to a public network");
  }

  return url.toString().replace(/\/$/, "");
}

export function localLLMEndpointsAllowed(): boolean {
  return (
    process.env.LLM_ALLOW_LOCAL_ENDPOINTS === "true" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.DOC2ALPACA_DESKTOP === "true")
  );
}
