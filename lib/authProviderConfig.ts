export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * 本地开发验证码必须同时满足两个条件：
 * 1. Next.js 明确运行在 development 环境；
 * 2. 开发者显式设置 ALLOW_DEV_OTP=true。
 *
 * 这样 staging、test 或漏设 NODE_ENV 的环境都不会意外把验证码返回给客户端。
 */
export function developmentOtpEnabled(env: Environment = process.env): boolean {
  return env.NODE_ENV === "development" && env.ALLOW_DEV_OTP === "true";
}

export function smsProviderConfigured(env: Environment = process.env): boolean {
  return Boolean(
    env.TENCENTCLOUD_SECRET_ID &&
      env.TENCENTCLOUD_SECRET_KEY &&
      env.TENCENT_SMS_SDK_APP_ID &&
      env.TENCENT_SMS_SIGN_NAME &&
      env.TENCENT_SMS_TEMPLATE_ID,
  );
}

export function phoneLoginEnabled(env: Environment = process.env): boolean {
  return smsProviderConfigured(env) || developmentOtpEnabled(env);
}

/**
 * GitHub 本地应用凭据优先；缺失时回退到正式凭据。
 * auth.ts 和登录页共同使用该函数，避免出现“后端已注册 provider，前端却隐藏按钮”。
 */
export function resolveGitHubCredentials(
  env: Environment = process.env,
): OAuthCredentials | null {
  const isDevelopment = env.NODE_ENV === "development";
  const clientId = isDevelopment
    ? env.AUTH_GITHUB_ID_DEV || env.AUTH_GITHUB_ID
    : env.AUTH_GITHUB_ID;
  const clientSecret = isDevelopment
    ? env.AUTH_GITHUB_SECRET_DEV || env.AUTH_GITHUB_SECRET
    : env.AUTH_GITHUB_SECRET;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
