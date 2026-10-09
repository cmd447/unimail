import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { encrypt } from "@/lib/crypto";
import type { ProfileInput, SmtpProfile, StoredProfile } from "@/lib/types";

const COL = "smtpProfiles";

function sanitize(id: string, d: FirebaseFirestore.DocumentData): SmtpProfile {
  return {
    id,
    name: d.name,
    host: d.host,
    port: d.port,
    encryption: d.encryption,
    user: d.user,
    hasPassword: Boolean(d.passEnc),
    imapHost: d.imapHost ?? "",
    imapPort: d.imapPort ?? 993,
    fromName: d.fromName,
    fromEmail: d.fromEmail,
    replyTo: d.replyTo ?? "",
    rateLimit: d.rateLimit ?? 60,
    lastVerifiedAt: d.lastVerifiedAt?.toDate?.().toISOString() ?? null,
    lastError: d.lastError ?? null,
    isDefault: Boolean(d.isDefault),
    createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
  };
}

export async function listProfiles(): Promise<SmtpProfile[]> {
  const snap = await db().collection(COL).orderBy("createdAt", "asc").get();
  return snap.docs.map((doc) => sanitize(doc.id, doc.data()));
}

export async function getProfile(id: string): Promise<StoredProfile | null> {
  const doc = await db().collection(COL).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data()! } as StoredProfile) : null;
}

export async function createProfile(input: ProfileInput): Promise<SmtpProfile> {
  const ref = db().collection(COL).doc();
  const count = (await db().collection(COL).limit(1).get()).size;
  const data = {
    name: input.name,
    host: input.host,
    port: input.port,
    encryption: input.encryption,
    user: input.user,
    passEnc: encrypt(input.password ?? ""),
    imapHost: input.imapHost ?? "",
    imapPort: input.imapPort ?? 993,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo ?? "",
    rateLimit: input.rateLimit ?? 60,
    isDefault: count === 0, // first profile becomes default
    lastVerifiedAt: null,
    lastError: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return sanitize(ref.id, { ...data, createdAt: null, lastVerifiedAt: null });
}

export async function updateProfile(id: string, input: Partial<ProfileInput>) {
  const update: Record<string, unknown> = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.host !== undefined && { host: input.host }),
    ...(input.port !== undefined && { port: input.port }),
    ...(input.encryption !== undefined && { encryption: input.encryption }),
    ...(input.user !== undefined && { user: input.user }),
    ...(input.imapHost !== undefined && { imapHost: input.imapHost }),
    ...(input.imapPort !== undefined && { imapPort: input.imapPort }),
    ...(input.fromName !== undefined && { fromName: input.fromName }),
    ...(input.fromEmail !== undefined && { fromEmail: input.fromEmail }),
    ...(input.replyTo !== undefined && { replyTo: input.replyTo }),
    ...(input.rateLimit !== undefined && { rateLimit: input.rateLimit }),
  };
  if (input.password) update.passEnc = encrypt(input.password);
  await db().collection(COL).doc(id).update(update);
}

export async function deleteProfile(id: string) {
  await db().collection(COL).doc(id).delete();
}

export async function setDefaultProfile(id: string) {
  const col = db().collection(COL);
  const snap = await col.where("isDefault", "==", true).get();
  const batch = db().batch();
  snap.docs.forEach((d) => batch.update(d.ref, { isDefault: false }));
  batch.update(col.doc(id), { isDefault: true });
  await batch.commit();
}

export async function markVerified(id: string, ok: boolean, error?: string) {
  await db().collection(COL).doc(id).update({
    lastVerifiedAt: FieldValue.serverTimestamp(),
    lastError: ok ? null : error ?? "Verification failed",
  });
}
