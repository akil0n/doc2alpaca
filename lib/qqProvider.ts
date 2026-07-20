import type { OAuthConfig } from "next-auth/providers";

interface QQProfile {
  openid: string;
  nickname?: string;
  figureurl_qq_2?: string;
  figureurl_qq_1?: string;
  ret?: number;
  msg?: string;
}

interface QQOpenIdResponse {
  client_id?: string;
  openid?: string;
  error?: number;
  error_description?: string;
}

export function QQProvider(options: {
  clientId: string;
  clientSecret: string;
}): OAuthConfig<QQProfile> {
  return {
    id: "qq",
    name: "QQ",
    type: "oauth",
    checks: ["state"],
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorization: {
      url: "https://graph.qq.com/oauth2.0/authorize",
      params: { response_type: "code", scope: "get_user_info" },
    },
    token: {
      url: "https://graph.qq.com/oauth2.0/token",
      params: { fmt: "json" },
    },
    userinfo: {
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const accessToken = String(tokens.access_token || "");
        const openIdResponse = await fetch(
          `https://graph.qq.com/oauth2.0/me?access_token=${encodeURIComponent(accessToken)}&fmt=json`,
          { headers: { Accept: "application/json" } }
        );
        const identity = (await openIdResponse.json()) as QQOpenIdResponse;
        if (!identity.openid || identity.error) {
          throw new Error("QQ identity verification failed");
        }

        const profileResponse = await fetch(
          `https://graph.qq.com/user/get_user_info?access_token=${encodeURIComponent(accessToken)}&oauth_consumer_key=${encodeURIComponent(options.clientId)}&openid=${encodeURIComponent(identity.openid)}&fmt=json`,
          { headers: { Accept: "application/json" } }
        );
        const profile = (await profileResponse.json()) as QQProfile;
        if (!profileResponse.ok || profile.ret !== 0) {
          throw new Error("QQ profile request failed");
        }
        return { ...profile, openid: identity.openid };
      },
    },
    profile(profile) {
      return {
        id: profile.openid,
        name: "QQ 用户",
        email: null,
        image: null,
      };
    },
  };
}
