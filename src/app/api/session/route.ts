import { NextRequest, NextResponse } from "next/server";
import { authConfigured, checkPassword, makeToken, sessionState } from "@/lib/session";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/constants";

export async function GET() {
  const s = await sessionState();
  return NextResponse.json({ authed: s.ok, reason: s.reason });
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD not set in .env.local" },
      { status: 503 },
    );
  }
  const { password } = await req.json().catch(() => ({}));
  if (!checkPassword(password ?? "")) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, makeToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
