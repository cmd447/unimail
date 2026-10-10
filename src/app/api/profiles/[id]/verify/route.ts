import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireApiSession } from "@/lib/api";
import { getProfile, markVerified } from "@/lib/profiles";
import { decrypt } from "@/lib/crypto";

// smtp errors are cryptic — translate the common ones
function hint(msg: string, host: string): string {
  const m = msg.toLowerCase();
  if (/535|eaauth|invalid login|authentication failed|username and password not accepted/.test(m))
    return `login rejected — wrong username or password. On Gmail/Outlook your normal password won't work: turn on 2FA, generate an app password, use that. (${msg})`;
  if (/enotfound|eai_again|getaddrinfo/.test(m))
    return `can't find "${host}" — check the smtp host spelling. (${msg})`;
  if (/econnrefused|econnreset|etimedout|timed? ?out|ehostunreach/.test(m))
    return `can't reach the server — check host, port, and encryption (ssl = 465, starttls = 587). (${msg})`;
  if (/certificate|self[- ]signed|ssl3|tls/.test(m))
    return `TLS trouble — try the other encryption mode, or port 587 + starttls. (${msg})`;
  return msg;
}

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
    const nice = hint(msg, profile.host);
    await markVerified(id, false, nice);
    return NextResponse.json({ ok: false, error: nice });
  }
}
