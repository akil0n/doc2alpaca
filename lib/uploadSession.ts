import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const UPLOAD_OWNER_COOKIE = "doc2alpaca_upload_owner";
const OWNER_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function getUploadOwner(request: NextRequest): string | null {
  const value = request.cookies.get(UPLOAD_OWNER_COOKIE)?.value ?? "";
  return OWNER_TOKEN_PATTERN.test(value) ? value : null;
}

export function getOrCreateUploadOwner(request: NextRequest): {
  ownerToken: string;
  isNew: boolean;
} {
  const existing = getUploadOwner(request);
  return existing
    ? { ownerToken: existing, isNew: false }
    : { ownerToken: randomBytes(32).toString("hex"), isNew: true };
}

export function setUploadOwnerCookie(
  response: NextResponse,
  ownerToken: string
): void {
  response.cookies.set(UPLOAD_OWNER_COOKIE, ownerToken, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.DOC2ALPACA_DESKTOP !== "true",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
}
