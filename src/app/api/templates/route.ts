import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { createTemplate, listTemplates } from "@/lib/templates";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  return NextResponse.json({ templates: await listTemplates() });
}

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (!body.name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  const template = await createTemplate({
    name: body.name,
    subject: body.subject ?? "",
    html: body.html ?? "",
    text: body.text ?? "",
  });
  return NextResponse.json({ template }, { status: 201 });
}
