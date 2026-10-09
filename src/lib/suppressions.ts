import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

const COL = "suppressions";

export const suppressionId = (email: string) =>
  crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export async function addSuppression(email: string, reason: string, source = "") {
  await db()
    .collection(COL)
    .doc(suppressionId(email))
    .set(
      {
        email: email.trim().toLowerCase(),
        reason,
        source,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function isSuppressed(email: string): Promise<boolean> {
  const doc = await db().collection(COL).doc(suppressionId(email)).get();
  return doc.exists;
}

/** Bulk suppression check — returns set of suppressed emails. */
export async function suppressedSet(emails: string[]): Promise<Set<string>> {
  const refs = emails.map((e) =>
    db().collection(COL).doc(suppressionId(e)),
  );
  const out = new Set<string>();
  for (let i = 0; i < refs.length; i += 250) {
    const docs = await db().getAll(...refs.slice(i, i + 250));
    docs.forEach((d) => {
      if (d.exists) out.add(d.data()!.email);
    });
  }
  return out;
}

export interface SuppressionRow {
  id: string;
  email: string;
  reason: string;
  source?: string;
  createdAt?: FirebaseFirestore.Timestamp;
}

export async function listSuppressions(): Promise<SuppressionRow[]> {
  const snap = await db().collection(COL).orderBy("createdAt", "desc").limit(500).get();
  return snap.docs.map((d) => ({
    id: d.id,
    email: d.data().email,
    reason: d.data().reason ?? "",
    source: d.data().source ?? "",
    createdAt: d.data().createdAt,
  }));
}

export async function removeSuppression(email: string) {
  await db().collection(COL).doc(suppressionId(email)).delete();
}
