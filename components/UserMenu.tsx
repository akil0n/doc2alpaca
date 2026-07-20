"use client";

import { signOut } from "next-auth/react";

export function UserMenu({
  name,
  image: _image,
}: {
  name: string;
  image?: string | null;
}) {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[12px] transition-all hover:scale-105"
      style={{ background: "var(--bg-surface-secondary)", color: "var(--text-secondary)" }}
      title="退出登录"
    >
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: "var(--accent)" }}>
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="max-w-20 truncate">{name}</span>
    </button>
  );
}
