import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/templates";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const template = await getTemplate(id);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  await updateTemplate(id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.subject !== undefined && { subject: body.subject }),
    ...(body.html !== undefined && { html: body.html }),
    ...(body.text !== undefined && { text: body.text }),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  await deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
