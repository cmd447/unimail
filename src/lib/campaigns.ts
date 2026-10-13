import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { Campaign, CampaignMessage, CampaignStatus } from "@/lib/types";

const COL = "campaigns";
const MESSAGES = "messages";

function toCampaign(id: string, d: FirebaseFirestore.DocumentData): Campaign {
  return {
    id,
    name: d.name,
    profileId: d.profileId,
    listId: d.listId,
    listName: d.listName ?? "",
    subject: d.subject ?? "",
    html: d.html ?? "",
    text: d.text ?? "",
    status: d.status,
    counters: d.counters ?? { total: 0, sent: 0, failed: 0, skipped: 0 },
    error: d.error ?? null,
    rateLimit: d.rateLimit ?? null,
    replyTo: d.replyTo ?? null,
    fromName: d.fromName ?? null,
    batchSize: d.batchSize ?? null,
    batchSent: d.batchSent ?? 0,
    scheduledAt: d.scheduledAt?.toDate?.().toISOString() ?? null,
    createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
    completedAt: d.completedAt?.toDate?.().toISOString() ?? null,
  };
}

export async function listCampaigns(): Promise<Campaign[]> {
  const snap = await db().collection(COL).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => toCampaign(d.id, d.data()));
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const doc = await db().collection(COL).doc(id).get();
  return doc.exists ? toCampaign(doc.id, doc.data()!) : null;
}

export async function createCampaign(input: {
  name: string;
  profileId: string;
  listId: string;
  listName: string;
  subject: string;
  html: string;
  text: string;
  rateLimit?: number | null;
  replyTo?: string | null;
  fromName?: string | null;
  batchSize?: number | null;
  scheduledAt?: Date | null;
}): Promise<Campaign> {
  const ref = db().collection(COL).doc();
  const status: CampaignStatus = input.scheduledAt ? "scheduled" : "draft";
  await ref.set({
    ...input,
    status,
    batchSent: 0,
    counters: { total: 0, sent: 0, failed: 0, skipped: 0 },
    createdAt: FieldValue.serverTimestamp(),
  });
  return {
    id: ref.id,
    ...input,
    status,
    counters: { total: 0, sent: 0, failed: 0, skipped: 0 },
    createdAt: null,
    scheduledAt: input.scheduledAt?.toISOString() ?? null,
  };
}

/**
 * Expand list members into per-recipient message docs under the campaign.
 * Idempotent: message doc id = contact id, so re-running never duplicates.
 */
export async function expandCampaign(campaignId: string, listId: string) {
  const col = db().collection("contacts");
  const msgs = db().collection(COL).doc(campaignId).collection(MESSAGES);
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let total = 0;

  for (;;) {
    // Single-field filter only — avoids needing a composite index.
    // Status filtered in code; pagination rides the implicit doc order.
    let q = col.where("listIds", "array-contains", listId).limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    last = snap.docs[snap.docs.length - 1];

    const batch = db().batch();
    for (const c of snap.docs) {
      if (c.data().status !== "active") continue;
      batch.set(msgs.doc(c.id), {
        email: c.data().email,
        contactId: c.id,
        firstName: c.data().firstName ?? "",
        lastName: c.data().lastName ?? "",
        fields: c.data().fields ?? {},
        status: "queued",
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
      total++;
    }
    await batch.commit();
    if (snap.docs.length < 400) break;
  }

  await db().collection(COL).doc(campaignId).update({ "counters.total": total });
  return total;
}

export async function updateCampaignContent(
  id: string,
  content: { subject: string; html: string; text: string },
) {
  await db().collection(COL).doc(id).update({
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}

export async function setCampaignStatus(id: string, status: CampaignStatus, error?: string | null) {
  await db().collection(COL).doc(id).update({
    status,
    ...(status === "completed" || status === "failed" || status === "cancelled"
      ? { completedAt: FieldValue.serverTimestamp() }
      : {}),
    ...(error !== undefined && { error }),
  });
}

export async function campaignMessages(
  campaignId: string,
  opts: { status?: string; limit?: number; after?: string },
): Promise<{ messages: CampaignMessage[]; next: string | null }> {
  const limit = Math.min(opts.limit ?? 100, 300);
  // doc-id order avoids the composite index status+email would need
  let q: FirebaseFirestore.Query = db()
    .collection(COL)
    .doc(campaignId)
    .collection(MESSAGES)
    .orderBy(FieldPath.documentId())
    .limit(limit + 1);
  if (opts.status) q = q.where("status", "==", opts.status);
  if (opts.after) {
    const cur = await db()
      .collection(COL)
      .doc(campaignId)
      .collection(MESSAGES)
      .doc(opts.after)
      .get();
    if (cur.exists) q = q.startAfter(cur);
  }
  const snap = await q.get();
  const docs = snap.docs
    .slice(0, limit)
    .sort((a, b) => String(a.data().email).localeCompare(String(b.data().email)));
  return {
    messages: docs.map((d) => {
      const m = d.data();
      return {
        id: d.id,
        email: m.email,
        contactId: m.contactId,
        status: m.status,
        attempts: m.attempts ?? 0,
        smtpResponse: m.smtpResponse ?? null,
        error: m.error ?? null,
        sentAt: m.sentAt?.toDate?.().toISOString() ?? null,
      };
    }),
    next: snap.docs.length > limit ? docs[docs.length - 1].id : null,
  };
}

export async function remainingQueued(campaignId: string): Promise<number> {
  const snap = await db()
    .collection(COL)
    .doc(campaignId)
    .collection(MESSAGES)
    .where("status", "==", "queued")
    .count()
    .get();
  return snap.data().count;
}

export async function deleteCampaign(id: string) {
  // Subcollection docs must be deleted explicitly.
  const msgs = db().collection(COL).doc(id).collection(MESSAGES);
  for (;;) {
    const snap = await msgs.limit(400).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await db().collection(COL).doc(id).delete();
}
