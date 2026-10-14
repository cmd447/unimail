import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireApiSession } from "@/lib/api";
import { FieldValue } from "firebase-admin/firestore";
import {
  deleteCampaign,
  getCampaign,
  remainingQueued,
  requeueAll,
  requeueFailed,
  setCampaignStatus,
} from "@/lib/campaigns";
import { db } from "@/lib/firebase/admin";
import { getProfile } from "@/lib/profiles";
import { expandCampaign } from "@/lib/campaigns";
import { dispatchCloud, dispatchLocal, queueEnabled } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Self-heal: a "sending" blast with a dead dispatch chain just sits
  // queued forever. Any page view re-kicks it — ticks are idempotent
  // (transactional claims), so extra kicks while a chain is alive are no-ops.
  if (campaign.status === "sending") {
    if (queueEnabled()) after(() => dispatchCloud(id).catch(() => {}));
    else after(() => dispatchLocal(id));
  }
  return NextResponse.json({ campaign });
}

const ACTIONS = ["send", "pause", "resume", "cancel", "edit", "retry", "rerun"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: Action;
    subject?: string;
    html?: string;
    text?: string;
    profileId?: string;
    rateLimit?: number | string | null;
    batchSize?: number | string | null;
    fromName?: string | null;
    replyTo?: string | null;
    priority?: "high" | "low" | "" | null;
  };
  const { action } = body;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const kick = async () => {
    if (queueEnabled()) await dispatchCloud(id);
    else after(() => dispatchLocal(id));
  };

  switch (action) {
    case "send": {
      if (!["draft", "scheduled"].includes(campaign.status)) {
        return NextResponse.json({ error: `Cannot send from ${campaign.status}` }, { status: 409 });
      }
      if (!campaign.counters.total) await expandCampaign(id, campaign.listId);
      await setCampaignStatus(id, "sending", null);
      await kick();
      break;
    }
    case "pause":
      if (campaign.status !== "sending") {
        return NextResponse.json({ error: "Not sending" }, { status: 409 });
      }
      await setCampaignStatus(id, "paused");
      break;
    case "resume": {
      if (campaign.status !== "paused") {
        return NextResponse.json({ error: "Not paused" }, { status: 409 });
      }
      await setCampaignStatus(id, "sending", null);
      await kick();
      break;
    }
    case "retry": {
      if (campaign.status === "sending") {
        return NextResponse.json({ error: "Already sending" }, { status: 409 });
      }
      const n = await requeueFailed(id);
      if (!n) {
        return NextResponse.json({ error: "nothing failed to retry" }, { status: 400 });
      }
      await db().collection("events").add({
        campaignId: id,
        campaignName: campaign.name,
        email: "—",
        status: "chain",
        detail: `retry — ${n} failed contact${n === 1 ? "" : "s"} requeued`,
        at: FieldValue.serverTimestamp(),
      });
      await setCampaignStatus(id, "sending", null);
      await kick();
      break;
    }
    case "rerun": {
      if (campaign.status === "sending") {
        return NextResponse.json({ error: "Already sending" }, { status: 409 });
      }
      const n = await requeueAll(id);
      if (!n) {
        return NextResponse.json({ error: "no contacts to resend" }, { status: 400 });
      }
      await db().collection("events").add({
        campaignId: id,
        campaignName: campaign.name,
        email: "—",
        status: "chain",
        detail: `rerun — ${n} contact${n === 1 ? "" : "s"} requeued`,
        at: FieldValue.serverTimestamp(),
      });
      await setCampaignStatus(id, "sending", null);
      await kick();
      break;
    }
    case "cancel":
      if (["completed", "cancelled"].includes(campaign.status)) {
        return NextResponse.json({ error: "Already finished" }, { status: 409 });
      }
      await setCampaignStatus(id, "cancelled");
      break;
    case "edit": {
      const subject = String(body.subject ?? campaign.subject).trim();
      const html = String(body.html ?? campaign.html);
      if (!subject || !html.trim()) {
        return NextResponse.json({ error: "need subject + html" }, { status: 400 });
      }
      const patch: Record<string, unknown> = {
        subject,
        html,
        text: String(body.text ?? campaign.text),
      };
      if (body.profileId && body.profileId !== campaign.profileId) {
        const p = await getProfile(body.profileId);
        if (!p) {
          return NextResponse.json({ error: "unknown sender" }, { status: 400 });
        }
        patch.profileId = body.profileId;
        // new sender = new placement question — refire the probe next send
        patch.probeSent = false;
      }
      if ("rateLimit" in body) {
        patch.rateLimit = body.rateLimit ? Number(body.rateLimit) : null;
      }
      if ("batchSize" in body) {
        patch.batchSize = body.batchSize ? Number(body.batchSize) : null;
      }
      if ("fromName" in body) patch.fromName = body.fromName?.trim() || null;
      if ("replyTo" in body) patch.replyTo = body.replyTo?.trim() || null;
      if ("priority" in body) {
        patch.priority =
          body.priority === "high" || body.priority === "low" ? body.priority : null;
      }
      // only queued contacts pick letter edits up — already-sent copies are gone
      await db().collection("campaigns").doc(id).update(patch);
      break;
    }
  }

  return NextResponse.json({ campaign: await getCampaign(id) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  await deleteCampaign(id);
  return NextResponse.json({ ok: true });
}
