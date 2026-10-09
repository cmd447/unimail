import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { db } from "@/lib/firebase/admin";

export async function GET(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);

  // equality+orderBy on different fields would need a composite index —
  // fetch the latest events, filter campaignId in code instead.
  const snap = await db()
    .collection("events")
    .orderBy("at", "desc")
    .limit(500)
    .get();
  const cid = sp.get("campaignId");
  const events = snap.docs
    .map((d) => {
      const e = d.data();
      return {
        id: d.id,
        ...e,
        at: e.at?.toDate?.().toISOString() ?? null,
      } as { id: string; campaignId?: string; [k: string]: unknown };
    })
    .filter((e) => !cid || e.campaignId === cid)
    .slice(0, limit);
  return NextResponse.json({ events });
}
