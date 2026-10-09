import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { deleteProfile, getProfile, setDefaultProfile, updateProfile } from "@/lib/profiles";
import type { ProfileInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  if (!(await getProfile(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as Partial<ProfileInput> & { isDefault?: boolean };
  if (body.isDefault) await setDefaultProfile(id);
  await updateProfile(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  await deleteProfile(id);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("um_profile");
  return res;
}
