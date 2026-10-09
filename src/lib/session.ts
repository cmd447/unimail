import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/constants";

export { SESSION_COOKIE, PROFILE_COOKIE, SESSION_DAYS } from "@/lib/constants";

function secret() {
  return process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || "";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** HMAC-signed token: "admin.<expiry>.<sig>" — no server state needed. */
export function makeToken() {
  const payload = `admin.${Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token?: string) {
  if (!token || !secret()) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const exp = Number(payload.split(".")[1]);
  if (!exp || exp < Date.now() / 1000) return false;
  const expected = sign(payload);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function checkPassword(input: string) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** Verify the session cookie, with the exact failure reason. */
export async function sessionState(): Promise<{ ok: boolean; reason: string }> {
  if (!secret()) {
    return { ok: false, reason: "SESSION_SECRET/ENCRYPTION_KEY unset on server" };
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, reason: "no session cookie — never logged in" };
  const i = token.lastIndexOf(".");
  if (i < 0) return { ok: false, reason: "malformed session token" };
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(payload);
  let sigOk = false;
  try {
    sigOk = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    /* length mismatch */
  }
  if (!sigOk) return { ok: false, reason: "session signature invalid (secret changed?)" };
  const exp = Number(payload.split(".")[1]);
  if (exp && exp < Date.now() / 1000) return { ok: false, reason: "session expired" };
  return { ok: true, reason: "ok" };
}

/** Verify the session cookie. Returns claims or null. */
export async function getSession() {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value) ? { uid: "admin" } : null;
}

/** Server-component guard — redirects to /login when unauthenticated. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
