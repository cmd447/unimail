import { Client } from "@upstash/qstash";

/**
 * Dispatch modes:
 *  - QStash (production): durable publish to /api/jobs/tick, retries built in.
 *  - Local (dev/no QStash): self-fetch to the same endpoint; the caller runs
 *    it inside next/server `after()` so the response isn't held up.
 */
export function queueEnabled() {
  return Boolean(process.env.QSTASH_TOKEN && process.env.APP_URL);
}

export function tickUrl() {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/jobs/tick`;
}

export async function dispatchCloud(campaignId: string, delaySeconds = 0) {
  const q = new Client({ token: process.env.QSTASH_TOKEN! });
  await q.publishJSON({
    url: tickUrl(),
    body: { campaignId },
    ...(delaySeconds > 0 && { delay: delaySeconds }),
    headers: { "x-um-secret": process.env.CRON_SECRET ?? "" },
  });
}

export async function dispatchLocal(campaignId: string) {
  try {
    const res = await fetch(tickUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-um-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ campaignId }),
    });
    if (!res.ok) {
      await logChainBreak(campaignId, `tick hop ${res.status}`);
    }
  } catch (e) {
    await logChainBreak(
      campaignId,
      `tick hop failed: ${e instanceof Error ? e.message : e}`,
    );
  }
}

/** A dead dispatch chain used to vanish silently — record it so the
 *  blast log shows WHY sending stalled instead of just sitting queued. */
async function logChainBreak(campaignId: string, detail: string) {
  try {
    const { db } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    await db().collection("events").add({
      campaignId,
      campaignName: "-",
      email: "-",
      status: "chain",
      detail,
      at: FieldValue.serverTimestamp(),
    });
  } catch {
    /* logging must never break the chain itself */
  }
}
