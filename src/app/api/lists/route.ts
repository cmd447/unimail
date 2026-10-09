import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { createList, listLists } from "@/lib/lists";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  return NextResponse.json({ lists: await listLists() });
}

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  const list = await createList(body.name.trim(), body.description ?? "");
  return NextResponse.json({ list }, { status: 201 });
}
