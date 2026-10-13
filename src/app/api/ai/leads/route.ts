import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { aiEnabled, aiParseLeads } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  if (!(await aiEnabled()))
    return NextResponse.json(
      { error: "ai not configured — set the key in Settings → ai rewrite" },
      { status: 400 },
    );

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "");
  if (!text.trim())
    return NextResponse.json({ error: "nothing pasted" }, { status: 400 });

  try {
    const rows = await aiParseLeads(text);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ai failed" },
      { status: 502 },
    );
  }
}
