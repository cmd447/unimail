import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { getSettings, updateSettings } from "@/lib/settings";
import { aiEnabled } from "@/lib/ai";

async function safe(s: Record<string, unknown>) {
  const { seedImapPassEnc, aiKeyEnc, ...rest } = s;
  return {
    ...rest,
    seedImapPassSet: Boolean(seedImapPassEnc),
    aiKeySet: Boolean(aiKeyEnc),
    aiEnabled: await aiEnabled(),
  };
}

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  return NextResponse.json({ settings: await safe(await getSettings() as unknown as Record<string, unknown>) });
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
    ...(body.aiKey !== undefined && {
      aiKeyEnc: body.aiKey ? encrypt(String(body.aiKey)) : "",
    }),
    ...(body.aiBaseUrl !== undefined && { aiBaseUrl: String(body.aiBaseUrl || "") || undefined }),
    ...(body.aiModel !== undefined && { aiModel: String(body.aiModel || "") || undefined }),
  });
  return NextResponse.json({ settings: await safe(await getSettings() as unknown as Record<string, unknown>) });
}
