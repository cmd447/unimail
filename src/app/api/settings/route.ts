import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { getSettings, updateSettings } from "@/lib/settings";

function safe(s: Record<string, unknown>) {
  const { seedImapPassEnc, ...rest } = s;
  return { ...rest, seedImapPassSet: Boolean(seedImapPassEnc) };
}

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  return NextResponse.json({ settings: safe(await getSettings() as unknown as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  await updateSettings({
    ...(body.killSwitch !== undefined && { killSwitch: Boolean(body.killSwitch) }),
    ...(body.dailyCap !== undefined && { dailyCap: Math.max(0, Number(body.dailyCap) || 0) }),
    ...(body.seedEmail !== undefined && { seedEmail: String(body.seedEmail || "") || undefined }),
    ...(body.seedImapHost !== undefined && { seedImapHost: String(body.seedImapHost || "") || undefined }),
    ...(body.seedImapPort !== undefined && { seedImapPort: Number(body.seedImapPort) || 993 }),
    ...(body.seedImapUser !== undefined && { seedImapUser: String(body.seedImapUser || "") || undefined }),
    ...(body.seedImapPass && { seedImapPassEnc: encrypt(String(body.seedImapPass)) }),
  });
  return NextResponse.json({ settings: safe(await getSettings() as unknown as Record<string, unknown>) });
}
