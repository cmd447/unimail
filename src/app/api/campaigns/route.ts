import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireApiSession } from "@/lib/api";
import {
  createCampaign,
  expandCampaign,
  getCampaign,
  listCampaigns,
  setCampaignStatus,
} from "@/lib/campaigns";
import { getList } from "@/lib/lists";
import { dispatchCloud, dispatchLocal, queueEnabled } from "@/lib/queue";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  return NextResponse.json({ campaigns: await listCampaigns() });
}

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const { name, profileId, listId, sendNow, scheduledAt, subject, html, text, rateLimit, replyTo, fromName, batchSize } = body as {
    name?: string;
    profileId?: string;
    listId?: string;
    sendNow?: boolean;
    scheduledAt?: string;
    subject?: string;
    html?: string;
    text?: string;
    rateLimit?: number;
    replyTo?: string;
    fromName?: string;
    batchSize?: number;
  };

  if (!name || !profileId || !listId || !subject) {
    return NextResponse.json(
      { error: "Missing name/profileId/listId/subject" },
      { status: 400 },
    );
  }
  if (!html && !text) {
    return NextResponse.json(
      { error: "Missing content — paste html or plain text" },
      { status: 400 },
    );
  }

  const list = await getList(listId);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const when = scheduledAt ? new Date(scheduledAt) : null;
  const campaign = await createCampaign({
    name,
    profileId,
    listId,
    listName: list.name,
    subject: subject.trim(),
    html: html || "",
    text: text || "",
    rateLimit: rateLimit && rateLimit > 0 ? Math.floor(rateLimit) : null,
    batchSize: batchSize && batchSize > 0 ? Math.floor(batchSize) : null,
    replyTo: replyTo?.trim() || null,
    fromName: fromName?.trim() || null,
    scheduledAt: when && when.getTime() > Date.now() ? when : null,
  });

  const total = await expandCampaign(campaign.id, listId);

  if (sendNow && !campaign.scheduledAt && total > 0) {
    await setCampaignStatus(campaign.id, "sending");
    if (queueEnabled()) {
      await dispatchCloud(campaign.id);
    } else {
      after(() => dispatchLocal(campaign.id));
    }
  }

  return NextResponse.json({ campaign: await getCampaign(campaign.id), total }, { status: 201 });
}
