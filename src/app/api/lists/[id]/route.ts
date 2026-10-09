import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireApiSession } from "@/lib/api";
import { db } from "@/lib/firebase/admin";
import { deleteList } from "@/lib/lists";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  await db().collection("lists").doc(id).update({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description }),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  await deleteList(id);
  return NextResponse.json({ ok: true });
}
