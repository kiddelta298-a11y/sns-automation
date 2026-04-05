import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "default-secret-change-in-production";
const COOKIE_NAME = "sns_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function makeToken(): string {
  const payload = `sns_auth:${Date.now()}`;
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${sig}`;
}

export function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [b64, sig] = parts;
  const payload = Buffer.from(b64, "base64").toString();
  const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!password) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }

  // Timing-safe comparison
  const expected = Buffer.from(ADMIN_PASSWORD);
  const given = Buffer.from(password);
  let match = expected.length === given.length;
  try {
    match = match && timingSafeEqual(expected, given);
  } catch {
    match = false;
  }

  if (!match) {
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  const token = makeToken();
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
