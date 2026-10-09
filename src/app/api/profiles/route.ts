import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/api";
import { createProfile, listProfiles } from "@/lib/profiles";
import { PROFILE_COOKIE } from "@/lib/constants";
import type { ProfileInput } from "@/lib/types";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  const jar = await cookies();
  const profiles = await listProfiles();
  // Fall back to the default profile when nothing is selected yet.
  let activeId = jar.get(PROFILE_COOKIE)?.value;
  const exists = profiles.some((p) => p.id === activeId);
  if (!exists) {
    activeId = (profiles.find((p) => p.isDefault) ?? profiles[0])?.id;
    if (activeId) jar.set(PROFILE_COOKIE, activeId, { path: "/", httpOnly: true });
  }
  return NextResponse.json({
    profiles: profiles.map((p) => ({ ...p, isActive: p.id === activeId })),
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = (await req.json()) as ProfileInput;

  const missing = ["name", "host", "port", "user", "password", "fromName", "fromEmail"].filter(
    (k) => !body[k as keyof ProfileInput],
  );
  if (missing.length) {
    return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 });
  }
  if (!["ssl", "starttls", "none"].includes(body.encryption)) {
    return NextResponse.json({ error: "Invalid encryption" }, { status: 400 });
  }

  try {
    const profile = await createProfile(body);
    // First profile — or no current selection — auto-activates it.
    const jar = await cookies();
    if (!jar.get(PROFILE_COOKIE)?.value || (body as { isDefault?: boolean }).isDefault) {
      jar.set(PROFILE_COOKIE, profile.id, { path: "/", httpOnly: true });
    }
    return NextResponse.json({ profile }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create profile" },
      { status: 500 },
    );
  }
}
