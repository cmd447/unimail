import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { addSuppression, listSuppressions, removeSuppression } from "@/lib/suppressions";
import { checkEmail } from "@/lib/validate";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  const rows = await listSuppressions();
  return NextResponse.json({
    suppressions: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt?.toDate?.().toISOString() ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { email, reason } = await req.json().catch(() => ({}));
  if (!email || checkEmail(email) === "invalid") {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  await addSuppression(email, reason ?? "manual", "settings");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  await removeSuppression(email);
  return NextResponse.json({ ok: true });
}
