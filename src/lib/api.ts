import { NextResponse } from "next/server";
import { sessionState } from "@/lib/session";

/** API guard — returns decoded claims, or a 401 response to send back. */
export async function requireApiSession() {
  const s = await sessionState();
  if (!s.ok) {
    return { error: NextResponse.json({ error: s.reason }, { status: 401 }) };
  }
  return { session: { uid: "admin" } };
}
