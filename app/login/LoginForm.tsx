"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

interface LoginFormProps {
  providers: {
    github: boolean;
    wechat: boolean;
    qq: boolean;
    phone: boolean;
  };
}

export function LoginForm({ providers }: LoginFormProps) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "验证码发送失败");
      setSent(true);
      setMessage("验证码已发送，5 分钟内有效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = await signIn("phone", {
      phone,
      code,
      redirect: false,
      redirectTo: "/",
    });
    setBusy(false);
    if (result?.error) {
      setMessage("手机号或验证码不正确");
      return;
    }
    window.location.assign("/");
  };

  const oauth = (provider: "github" | "wechat" | "qq") =>
    signIn(provider, { redirectTo: "/" });

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      <section className="apple-card shadow-apple-xl w-full max-w-md p-8">
        <div className="text-center mb-7">
          <div
            className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center text-white text-xl font-bold mb-4"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-highlight))" }}
          >
            D2A
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            登录 Doc2Alpaca
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-tertiary)" }}>
            密钥和生成结果将按账户加密保存，原始文档不会保留
          </p>
        </div>

        {providers.phone && (
          <form onSubmit={verify} className="space-y-3">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              placeholder="中国大陆手机号"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)" }}
            />
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="6 位验证码"
                className="min-w-0 flex-1 px-4 py-3 rounded-xl outline-none"
                style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)" }}
              />
              <button type="button" disabled={busy || phone.length < 11} onClick={requestCode} className="btn-ghost px-4">
                {sent ? "重新发送" : "获取验证码"}
              </button>
            </div>
            <button disabled={busy || code.length !== 6} className="btn-apple w-full py-3">
              {busy ? "请稍候…" : "手机号登录"}
            </button>
          </form>
        )}

        {(providers.github || providers.wechat || providers.qq) && (
          <>
            <div className="flex items-center gap-3 my-6 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
              其他登录方式
              <span className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
            </div>
            <div className="grid gap-2">
              {providers.wechat && <button onClick={() => oauth("wechat")} className="btn-ghost py-3">微信扫码登录</button>}
              {providers.qq && <button onClick={() => oauth("qq")} className="btn-ghost py-3">QQ 登录</button>}
              {providers.github && <button onClick={() => oauth("github")} className="btn-ghost py-3">GitHub 登录</button>}
            </div>
          </>
        )}

        {message && (
          <p className="mt-4 text-center text-sm" role="status" style={{ color: "var(--text-secondary)" }}>
            {message}
          </p>
        )}
        <p className="mt-7 text-xs leading-relaxed text-center" style={{ color: "var(--text-tertiary)" }}>
          登录即表示你理解：生成时，文档内容会发送给你配置的模型服务商。
        </p>
      </section>
    </main>
  );
}
