import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processBatch } from "@/lib/send-worker";
import { dispatchCloud, dispatchLocal, queueEnabled, tickUrl } from "@/lib/queue";

export const maxDuration = 60;

async function authorized(req: NextRequest, rawBody: string): Promise<boolean> {
  // QStash signature (production)
  const sigKeys = [
    process.env.QSTASH_CURRENT_SIGNING_KEY,
    process.env.QSTASH_NEXT_SIGNING_KEY,
  ];
  if (sigKeys.every(Boolean)) {
    try {
      const r = new Receiver({
        currentSigningKey: sigKeys[0]!,
        nextSigningKey: sigKeys[1]!,
      });
      return await r.verify({
        signature: req.headers.get("upstash-signature") ?? "",
        body: rawBody,
        url: tickUrl(),
      });
    } catch {
      return false;
    }
  }
  // Shared secret
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("x-um-secret") === secret;
  // Dev fallback: localhost only
  const host = req.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!(await authorized(req, rawBody))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { campaignId } = JSON.parse(rawBody || "{}");
  if (!campaignId) {
    return NextResponse.json({ error: "Missing campaignId" }, { status: 400 });
  }

  const result = await processBatch(campaignId);

  if (result.active && result.remaining > 0) {
    if (queueEnabled()) {
      await dispatchCloud(campaignId, 2);
    } else {
      after(() => dispatchLocal(campaignId));
    }
  }

  return NextResponse.json(result);
}
