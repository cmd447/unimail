import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { getList, importContacts, ImportRow } from "@/lib/lists";

const MAX_ROWS = 2000;

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const { listId, rows } = body as { listId?: string; rows?: ImportRow[] };

  if (!listId || !(await getList(listId))) {
    return NextResponse.json({ error: "Unknown list" }, { status: 400 });
  }
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: "No rows" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Chunk too large (max ${MAX_ROWS})` },
      { status: 400 },
    );
  }

  const result = await importContacts(listId, rows);
  return NextResponse.json(result);
}
