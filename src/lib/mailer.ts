import nodemailer from "nodemailer";
import { decrypt } from "@/lib/crypto";
import { getProfile } from "@/lib/profiles";
import type { StoredProfile } from "@/lib/types";

export function makeTransport(profile: StoredProfile, pool = false) {
  return nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.encryption === "ssl",
    auth: profile.passEnc
      ? { user: profile.user, pass: decrypt(profile.passEnc) }
      : undefined,
    ...(profile.encryption === "starttls" && { requireTLS: true }),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(pool && { pool: true, maxConnections: 3, maxMessages: 50 }),
  });
}

export function fromHeader(p: StoredProfile) {
  return p.fromName ? `"${p.fromName.replace(/"/g, "")}" <${p.fromEmail}>` : p.fromEmail;
}

export async function sendMail(
  profileId: string,
  opts: {
    to: string;
    subject: string;
    html?: string; // omit for a plain-text-only message
    text: string;
    headers?: Record<string, string>;
  },
) {
  const profile = await getProfile(profileId);
  if (!profile) throw new Error("SMTP profile not found");
  const transport = makeTransport(profile);
  try {
    return await transport.sendMail({
      from: fromHeader(profile),
      replyTo: profile.replyTo || undefined,
      ...opts,
    });
  } finally {
    transport.close();
  }
}
