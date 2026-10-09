import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireApiSession } from "@/lib/api";
import { getProfile, markVerified } from "@/lib/profiles";
import { decrypt } from "@/lib/crypto";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const profile = await getProfile(id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!profile.passEnc) {
    return NextResponse.json({ error: "No password stored" }, { status: 400 });
  }

  const transport = nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.encryption === "ssl",
    auth: { user: profile.user, pass: decrypt(profile.passEnc) },
    ...(profile.encryption === "starttls" && { requireTLS: true }),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.verify();
    await markVerified(id, true);
    return NextResponse.json({ ok: true, message: "Connection verified" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    await markVerified(id, false, msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
