import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { getContacts } from "@/lib/lists";

export async function GET(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const out = await getContacts({
    listId: sp.get("listId") ?? undefined,
    after: sp.get("after") ?? undefined,
    limit: Number(sp.get("limit")) || 100,
  });
  return NextResponse.json(out);
}
