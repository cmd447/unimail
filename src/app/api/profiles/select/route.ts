import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { getProfile } from "@/lib/profiles";
import { PROFILE_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await req.json().catch(() => ({}));
  if (!id || !(await getProfile(id))) {
    return NextResponse.json({ error: "Unknown profile" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PROFILE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
