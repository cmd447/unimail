import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { db } from "@/lib/firebase/admin";

// GET /api/message?c=<campaignId>&m=<messageId> — full message doc incl rendered letter
export async function GET(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const c = sp.get("c");
  const m = sp.get("m");
  if (!c || !m) {
    return NextResponse.json({ error: "Missing c/m" }, { status: 400 });
  }

  const doc = await db()
    .collection("campaigns")
    .doc(c)
    .collection("messages")
    .doc(m)
    .get();
  if (!doc.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const d = doc.data()!;
  const iso = (v: any) => v?.toDate?.().toISOString?.() ?? v ?? null;
  return NextResponse.json({
    message: {
      id: doc.id,
      ...d,
      sentAt: iso(d.sentAt),
      createdAt: iso(d.createdAt),
    },
  });
}
