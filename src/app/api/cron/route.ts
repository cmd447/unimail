import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/firebase/admin";
import { setCampaignStatus } from "@/lib/campaigns";
import { listProfiles } from "@/lib/profiles";
import { getProfile } from "@/lib/profiles";
import { pollBounces } from "@/lib/bounces";
import { checkProbes } from "@/lib/probe";
import { dispatchCloud, dispatchLocal, queueEnabled } from "@/lib/queue";

export const maxDuration = 120;

/**
 * Vercel Cron entry point (see vercel.json). Handles:
 *  1. scheduled campaigns whose time has come → start sending
 *  2. IMAP bounce polling for profiles that configured imapHost
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. For local testing
 * with no secret set, localhost is allowed.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const host = req.headers.get("host") ?? "";
    if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const out: Record<string, unknown> = { launched: [], bounces: {} };

  // 1. Due scheduled campaigns (single-field query → filter time in code)
  const due = await db()
    .collection("campaigns")
    .where("status", "==", "scheduled")
    .get();
  const now = Date.now();
  for (const doc of due.docs) {
    const c = doc.data();
    const at = c.scheduledAt?.toDate?.().getTime() ?? 0;
    if (at && at <= now) {
      await setCampaignStatus(doc.id, "sending");
      if (queueEnabled()) await dispatchCloud(doc.id);
      else after(() => dispatchLocal(doc.id));
      (out.launched as string[]).push(c.name);
    }
  }

  // 2. Bounce polling
  const profiles = await listProfiles();
  for (const p of profiles.filter((x) => x.imapHost)) {
    const full = await getProfile(p.id);
    if (!full) continue;
    const r = await pollBounces(full);
    (out.bounces as Record<string, unknown>)[p.name] = r;
  }

  // 3. Spam-probe placement check (seed inbox INBOX vs spam folders)
  try {
    out.probes = await checkProbes();
  } catch (e) {
    out.probes = { error: e instanceof Error ? e.message : "probe scan failed" };
  }

  return NextResponse.json(out);
}
