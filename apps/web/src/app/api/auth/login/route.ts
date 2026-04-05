import { NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "default-secret-change-in-production";
const COOKIE_NAME = "sns_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function makeToken(): Promise<string> {
  const payload = `sns_auth:${Date.now()}`;
  const keyData = new TextEncoder().encode(SESSION_SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${btoa(payload)}.${sigHex}`;
}

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!password) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  const token = await makeToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
