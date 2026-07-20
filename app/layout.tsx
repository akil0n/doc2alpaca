import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./workbench.css";
import "./refinement-v0.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "Doc to Alpaca — 智能文档数据集转换",
  description: "将你的文档一键转换为高质量的 Alpaca 格式训练数据集",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (navigator.userAgent.includes('Electron')) {
                  document.documentElement.classList.add('electron');
                }
                var stored = localStorage.getItem('doc2alpaca-dark-mode');
                if (stored === 'true' || (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
                var accent = localStorage.getItem('doc2alpaca-accent-theme') || 'ocean';
                document.documentElement.dataset.accent = accent;
                if (accent === 'custom') {
                  document.documentElement.style.setProperty('--custom-accent', localStorage.getItem('doc2alpaca-custom-accent') || '#147a5b');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
