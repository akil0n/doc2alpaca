import type { Adapter, AdapterAccount } from "@auth/core/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import WeChat from "next-auth/providers/wechat";
import { prisma } from "@/lib/prisma";
import { QQProvider } from "@/lib/qqProvider";
import { verifyPhoneOtp } from "@/lib/smsService";
import { privacyHash } from "@/lib/serverCrypto";

const baseAdapter = PrismaAdapter(prisma);
function protectedAccountId(provider: string, providerAccountId: string) {
  return privacyHash(providerAccountId, `oauth-account:${provider}`);
}

const privacyAdapter: Adapter = {
  ...baseAdapter,
  async getUserByAccount(account) {
    return (
      (await baseAdapter.getUserByAccount?.({
        ...account,
        providerAccountId: protectedAccountId(account.provider, account.providerAccountId),
      })) ?? null
    );
  },
  async getAccount(providerAccountId, provider) {
    return (
      (await baseAdapter.getAccount?.(
        protectedAccountId(provider, providerAccountId),
        provider
      )) ?? null
    );
  },
  async unlinkAccount(account) {
    await baseAdapter.unlinkAccount?.({
      ...account,
      providerAccountId: protectedAccountId(account.provider, account.providerAccountId),
    });
  },
  async linkAccount(account: AdapterAccount) {
    const safeAccount: AdapterAccount = {
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: protectedAccountId(account.provider, account.providerAccountId),
    };
    await baseAdapter.linkAccount?.(safeAccount);
  },
};

const providers: Provider[] = [
  Credentials({
    id: "phone",
    name: "手机号",
    credentials: {
      phone: { label: "手机号", type: "tel" },
      code: { label: "验证码", type: "text" },
    },
    async authorize(credentials) {
      const phone = typeof credentials.phone === "string" ? credentials.phone : "";
      const code = typeof credentials.code === "string" ? credentials.code : "";
      const user = await verifyPhoneOtp(phone, code);
      return user ? { id: user.id, name: user.name } : null;
    },
  }),
];

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      profile(profile) {
        return { id: String(profile.id), name: "GitHub 用户", email: null, image: null };
      },
    })
  );
}
if (process.env.AUTH_WECHAT_ID && process.env.AUTH_WECHAT_SECRET) {
  providers.push(
    WeChat({
      clientId: process.env.AUTH_WECHAT_ID,
      clientSecret: process.env.AUTH_WECHAT_SECRET,
      platformType: "WebsiteApp",
      profile(profile) {
        return {
          id: profile.unionid || profile.openid,
          name: "微信用户",
          email: null,
          image: null,
        };
      },
    })
  );
}
if (process.env.AUTH_QQ_ID && process.env.AUTH_QQ_SECRET) {
  providers.push(
    QQProvider({
      clientId: process.env.AUTH_QQ_ID,
      clientSecret: process.env.AUTH_QQ_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: privacyAdapter,
  providers,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
