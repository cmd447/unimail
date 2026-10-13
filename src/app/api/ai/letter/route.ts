import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { aiEnabled, aiJudgeLetter, aiRewriteLetter } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  if (!(await aiEnabled()))
    return NextResponse.json(
      { error: "ai not configured — set AI_API_KEY (+ AI_MODEL, AI_BASE_URL) in .env.local" },
      { status: 400 },
    );

  const body = await req.json().catch(() => ({}));
  const draft = {
    subject: String(body.subject ?? ""),
    html: String(body.html ?? ""),
    text: String(body.text ?? ""),
  };
  if (!draft.html.trim())
    return NextResponse.json({ error: "nothing to look at" }, { status: 400 });

  try {
    if (body.mode === "judge") {
      const r = await aiJudgeLetter(draft);
      return NextResponse.json({ ok: true, ...r });
    }
    const r = await aiRewriteLetter(
      draft,
      typeof body.focus === "string" && body.focus.trim()
        ? body.focus.slice(0, 400)
        : undefined,
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ai failed" },
      { status: 502 },
    );
  }
}
