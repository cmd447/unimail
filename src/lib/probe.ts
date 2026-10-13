import { ImapFlow } from "imapflow";
import { FieldValue } from "firebase-admin/firestore";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/firebase/admin";
import { sendMail } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";

/**
 * Inbox-placement probe — the only honest way to know if mail hit spam.
 * We fire the real letter at a seed mailbox you control, then IMAP-scan
 * its INBOX vs spam/junk folders to see where it landed.
 */

async function logProbe(
  campaignId: string,
  campaignName: string,
  email: string,
  status: string,
  detail: string,
) {
  await db().collection("events").add({
    campaignId,
    campaignName,
    email,
    status,
    detail,
    at: FieldValue.serverTimestamp(),
  });
}

/** Fire the letter at the seed inbox and register a pending probe. */
export async function sendProbe(opts: {
  profileId: string;
  subject: string;
  html: string;
  text?: string;
  campaignId?: string;
  campaignName?: string;
}) {
  const s = await getSettings();
  if (!s.seedEmail) throw new Error("no seed inbox — set one in settings");
  const info = await sendMail(opts.profileId, {
    to: s.seedEmail,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? "",
  });
  const ref = await db().collection("probes").add({
    subject: opts.subject,
    campaignId: opts.campaignId ?? null,
    campaignName: opts.campaignName ?? null,
    smtpMessageId: info.messageId ?? null,
    sentAt: FieldValue.serverTimestamp(),
    placement: null,
  });
  await logProbe(
    opts.campaignId ?? "",
    opts.campaignName ?? "(probe)",
    s.seedEmail,
    "probe",
    `probe fired → ${s.seedEmail}`,
  );
  return { id: ref.id, seed: s.seedEmail };
}

/**
 * Scan the seed mailbox for pending probes (<48h) and record where each
 * landed: "inbox" | "spam" | still null (not arrived / still transit).
 */
export async function checkProbes(): Promise<{
  checked: number;
  placed: number;
}> {
  const s = await getSettings();
  if (!s.seedImapHost || !s.seedImapUser || !s.seedImapPassEnc) {
    return { checked: 0, placed: 0 };
  }

  const since = new Date(Date.now() - 48 * 3600 * 1000);
  // single-field range only — placement==null filtered in code
  const recent = await db()
    .collection("probes")
    .where("sentAt", ">=", since)
    .limit(100)
    .get();
  const pdocs = recent.docs
    .filter((d) => d.data().placement == null)
    .slice(0, 50);
  const pending = { docs: pdocs, size: pdocs.length };
  if (!pending.size) return { checked: 0, placed: 0 };

  const client = new ImapFlow({
    host: s.seedImapHost,
    port: s.seedImapPort ?? 993,
    secure: (s.seedImapPort ?? 993) === 993,
    auth: { user: s.seedImapUser, pass: decrypt(s.seedImapPassEnc) },
    logger: false,
    socketTimeout: 20_000,
  });

  let placed = 0;
  try {
    await client.connect();

    // find spam-ish folders
    const paths: string[] = [];
    const walk = (items: any[]) => {
      for (const b of items) {
        if (b.path) paths.push(b.path);
        if (b.folders) walk(b.folders);
      }
    };
    walk((await client.list()) as any);
    const spamBoxes = paths.filter((p) => /spam|junk|bulk/i.test(p) && !/^inbox$/i.test(p));
    const boxes = ["INBOX", ...spamBoxes];

    for (const doc of pending.docs) {
      const p = doc.data();
      let hit: string | null = null;
      for (const box of boxes) {
        const lock = await client.getMailboxLock(box);
        try {
          const uids =
            (await client.search({
              subject: p.subject,
              since: p.sentAt?.toDate?.() ?? since,
            })) || [];
          if (uids.length) {
            hit = box;
            // mark seen so it doesn't keep showing as unread noise
            for (const uid of uids) await client.messageFlagsAdd(uid, ["\\Seen"]).catch(() => {});
            break;
          }
        } finally {
          lock.release();
        }
      }

      if (hit) {
        const placement = /^inbox$/i.test(hit) ? "inbox" : "spam";
        await doc.ref.update({ placement, folder: hit });
        placed++;
        await logProbe(
          p.campaignId ?? "",
          p.campaignName ?? "(probe)",
          s.seedEmail ?? "",
          "probe",
          placement === "inbox"
            ? `✓ landed in INBOX (${hit})`
            : `✗ landed in SPAM (${hit}) — letter is getting filtered`,
        );
      }
    }
    await client.logout();
  } catch (e) {
    try {
      await client.logout();
    } catch {
      /* closed */
    }
    throw e;
  }
  return { checked: pending.size, placed };
}

export async function listProbes(limit = 30) {
  const snap = await db()
    .collection("probes")
    .orderBy("sentAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      ...p,
      sentAt: p.sentAt?.toDate?.().toISOString() ?? null,
    };
  });
}
