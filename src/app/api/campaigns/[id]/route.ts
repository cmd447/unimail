import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireApiSession } from "@/lib/api";
import {
  deleteCampaign,
  getCampaign,
  remainingQueued,
  setCampaignStatus,
  updateCampaignContent,
} from "@/lib/campaigns";
import { expandCampaign } from "@/lib/campaigns";
import { dispatchCloud, dispatchLocal, queueEnabled } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaign });
}

const ACTIONS = ["send", "pause", "resume", "cancel", "edit"] as const;
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
      if (!["draft", "failed", "scheduled"].includes(campaign.status)) {
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
    case "cancel":
      if (["completed", "cancelled"].includes(campaign.status)) {
        return NextResponse.json({ error: "Already finished" }, { status: 409 });
      }
      await setCampaignStatus(id, "cancelled");
      break;
    case "edit": {
      if (["completed", "cancelled"].includes(campaign.status)) {
        return NextResponse.json({ error: "Blast already finished" }, { status: 409 });
      }
      const subject = String(body.subject ?? "").trim();
      const html = String(body.html ?? "");
      if (!subject || !html.trim()) {
        return NextResponse.json({ error: "need subject + html" }, { status: 400 });
      }
      // only queued contacts pick this up — already-sent copies are gone
      await updateCampaignContent(id, {
        subject,
        html,
        text: String(body.text ?? ""),
      });
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
