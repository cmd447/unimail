import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { campaignMessages } from "@/lib/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const out = await campaignMessages(id, {
    status: sp.get("status") ?? undefined,
    after: sp.get("after") ?? undefined,
    limit: Number(sp.get("limit")) || 100,
  });
  return NextResponse.json(out);
}
