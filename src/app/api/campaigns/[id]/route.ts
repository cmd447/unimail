import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireApiSession } from "@/lib/api";
import {
  deleteCampaign,
  getCampaign,
  remainingQueued,
  setCampaignStatus,
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

const ACTIONS = ["send", "pause", "resume", "cancel"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: Action };
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
      await setCampaignStatus(id, "sending");
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
      await setCampaignStatus(id, "sending");
      await kick();
      break;
    }
    case "cancel":
      if (["completed", "cancelled"].includes(campaign.status)) {
        return NextResponse.json({ error: "Already finished" }, { status: 409 });
      }
      await setCampaignStatus(id, "cancelled");
      break;
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
