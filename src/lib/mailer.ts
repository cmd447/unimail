import crypto from "crypto";
import nodemailer from "nodemailer";
import { decrypt } from "@/lib/crypto";
import { getProfile } from "@/lib/profiles";
import type { StoredProfile } from "@/lib/types";

// Strip the Nodemailer MIME fingerprint ("--_NmP-…-Part_N").
// Every spam-filter database has this boundary prefix cataloged as
// "automated bulk tool". Replace with a generic format that matches
// Java Mail / Outlook / many MUAs — not fingerprinted to any one library.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MimeNode = require("nodemailer/lib/mime-node");
MimeNode.prototype._generateBoundary = function () {
  return "----=_Part_" + crypto.randomBytes(12).toString("hex");
};

export function makeTransport(profile: StoredProfile, pool = false) {
  // EHLO hostname must match the sending domain — os.hostname() leaks
  // "DESKTOP-XYZ" or "169.254.x.x" into Received headers (spam signal)
  const domain = profile.fromEmail?.split("@")[1] || undefined;
  return nodemailer.createTransport({
    ...(domain && { name: domain }),
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

/**
 * Wrap bare HTML in a proper email document structure if missing.
 * Bare `<p>hi</p>` without DOCTYPE/body looks like a quick script;
 * a full document looks like a real email client sent it.
 */
export function normalizeHtml(html: string): string {
  if (!html) return html;
  const lower = html.toLowerCase();
  // already has DOCTYPE or full <html…><body structure — leave it alone
  if (lower.includes("<!doctype") || (lower.includes("<html") && lower.includes("<body"))) {
    return html;
  }
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;">
${html}
</body>
</html>`;
}

export async function sendMail(
  profileId: string,
  opts: {
    to: string;
    subject: string;
    html?: string; // omit for a plain-text-only message
    text: string;
    headers?: Record<string, string>;
    fromName?: string; // override the profile's display name
    replyTo?: string; // override the profile's reply-to
  },
) {
  const profile = await getProfile(profileId);
  if (!profile) throw new Error("SMTP profile not found");
  const transport = makeTransport(profile);
  try {
    const { fromName, replyTo, ...mailOpts } = opts;
    return await transport.sendMail({
      from: fromName
        ? `"${fromName.replace(/"/g, "")}" <${profile.fromEmail}>`
        : fromHeader(profile),
      replyTo: replyTo || profile.replyTo || undefined,
      ...mailOpts,
      ...(opts.html && { html: normalizeHtml(opts.html) }),
    });
  } finally {
    transport.close();
  }
}
