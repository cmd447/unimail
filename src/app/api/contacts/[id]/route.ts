import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { deleteContact } from "@/lib/lists";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  await deleteContact(id);
  return NextResponse.json({ ok: true });
}
