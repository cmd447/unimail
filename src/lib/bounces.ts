import { ImapFlow } from "imapflow";
import { FieldValue } from "firebase-admin/firestore";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/firebase/admin";
import { contactId } from "@/lib/lists";
import { addSuppression } from "@/lib/suppressions";
import type { StoredProfile } from "@/lib/types";

const BOUNCE_RE = /mailer-daemon|postmaster|delivery.?status|undeliverable|returned mail/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Scan a profile's IMAP inbox for unseen bounce notifications, mark the
 * bounced contacts, and add them to the suppression list.
 * Requires profile.imapHost (same user/pass as SMTP in most setups).
 */
export async function pollBounces(profile: StoredProfile): Promise<{
  scanned: number;
  bounced: string[];
}> {
  const out = { scanned: 0, bounced: [] as string[] };
  if (!profile.imapHost || !profile.passEnc) return out;

  const client = new ImapFlow({
    host: profile.imapHost,
    port: profile.imapPort ?? 993,
    secure: (profile.imapPort ?? 993) === 993,
    auth: { user: profile.user, pass: decrypt(profile.passEnc) },
    logger: false,
    socketTimeout: 20_000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const uids = await client.search({ seen: false, since });
      if (!uids || !uids.length) return out;

      for (const uid of uids.slice(0, 200)) {
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
        if (!msg || !msg.source) continue;
        out.scanned++;
        const head = `${msg.envelope?.subject ?? ""} ${msg.envelope?.from?.[0]?.address ?? ""}`;
        const text = head + "\n" + msg.source.toString("utf8").slice(0, 20_000);
        if (!BOUNCE_RE.test(head) && !/delivery-status|failed/i.test(text.slice(0, 2000))) {
          continue;
        }

        const emails = (text.match(EMAIL_RE) ?? [])
          .map((e) => e.toLowerCase())
          .filter(
            (e) =>
              e !== profile.user.toLowerCase() &&
              e !== profile.fromEmail.toLowerCase() &&
              !/mailer-daemon|postmaster/.test(e),
          );
        await client.messageFlagsAdd(uid, ["\\Seen"]);

        for (const email of [...new Set(emails)]) {
          await db()
            .collection("contacts")
            .doc(contactId(email))
            .set({ status: "bounced" }, { merge: true });
          await addSuppression(email, "bounced", profile.id);
          out.bounced.push(email);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    await db()
      .collection("smtpProfiles")
      .doc(profile.id)
      .update({
        lastError: `IMAP: ${e instanceof Error ? e.message : "poll failed"}`,
      });
    try {
      await client.logout();
    } catch {
      /* already closed */
    }
  }
  return out;
}

/** Event-log helper kept separate to avoid a circular import. */
export async function logBounceEvent(email: string, profileName: string) {
  await db().collection("events").add({
    campaignId: "",
    campaignName: "(bounce scan)",
    email,
    status: "bounced",
    detail: `bounce detected via ${profileName}`,
    at: FieldValue.serverTimestamp(),
  });
}
