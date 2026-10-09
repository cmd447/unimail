import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { EmailTemplate } from "@/lib/types";

const COL = "emailTemplates";

function toTemplate(id: string, d: FirebaseFirestore.DocumentData): EmailTemplate {
  return {
    id,
    name: d.name,
    subject: d.subject ?? "",
    html: d.html ?? "",
    text: d.text ?? "",
    createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
    updatedAt: d.updatedAt?.toDate?.().toISOString() ?? null,
  };
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  const snap = await db().collection(COL).orderBy("updatedAt", "desc").get();
  return snap.docs.map((d) => toTemplate(d.id, d.data()));
}

export async function getTemplate(id: string): Promise<EmailTemplate | null> {
  const doc = await db().collection(COL).doc(id).get();
  return doc.exists ? toTemplate(doc.id, doc.data()!) : null;
}

export async function createTemplate(
  input: Pick<EmailTemplate, "name" | "subject" | "html" | "text">,
): Promise<EmailTemplate> {
  const ref = db().collection(COL).doc();
  await ref.set({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, ...input, createdAt: null, updatedAt: null };
}

export async function updateTemplate(
  id: string,
  input: Partial<Pick<EmailTemplate, "name" | "subject" | "html" | "text">>,
) {
  await db()
    .collection(COL)
    .doc(id)
    .update({ ...input, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteTemplate(id: string) {
  await db().collection(COL).doc(id).delete();
}
