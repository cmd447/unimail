import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { checkProbes, listProbes, sendProbe } from "@/lib/probe";
import { getSettings } from "@/lib/settings";

export const maxDuration = 60;

// POST — fire the letter at the seed inbox
export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { profileId, subject, html, text, campaignId, campaignName } =
    await req.json().catch(() => ({}));
  if (!profileId || !subject || !html) {
    return NextResponse.json(
      { error: "Missing profileId/subject/html" },
      { status: 400 },
    );
  }
  try {
    const r = await sendProbe({ profileId, subject, html, text, campaignId, campaignName });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "probe failed" },
      { status: 502 },
    );
  }
}

// GET — scan the seed mailbox, resolve pending probes, return recent list
export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  const s = await getSettings();
  const probe = { seedEmail: s.seedEmail ?? null, configured: Boolean(s.seedImapHost && s.seedImapUser && s.seedImapPassEnc) };
  try {
    const r = await checkProbes();
    return NextResponse.json({ ...r, ...probe, probes: await listProbes() });
  } catch (e) {
    return NextResponse.json({
      checked: 0, placed: 0, ...probe,
      probes: await listProbes(),
      error: e instanceof Error ? e.message : "scan failed",
    });
  }
}
