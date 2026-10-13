import crypto from "crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { checkEmail } from "@/lib/validate";
import type { Contact, MailList } from "@/lib/types";

const LISTS = "lists";
const CONTACTS = "contacts";

export const contactId = (email: string) =>
  crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

// lists

function toList(id: string, d: FirebaseFirestore.DocumentData): MailList {
  return {
    id,
    name: d.name,
    description: d.description ?? "",
    count: d.count ?? 0,
    createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
  };
}

export async function listLists(): Promise<MailList[]> {
  const snap = await db().collection(LISTS).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => toList(d.id, d.data()));
}

export async function getList(id: string): Promise<MailList | null> {
  const doc = await db().collection(LISTS).doc(id).get();
  return doc.exists ? toList(doc.id, doc.data()!) : null;
}

export async function createList(name: string, description = ""): Promise<MailList> {
  const ref = db().collection(LISTS).doc();
  await ref.set({ name, description, count: 0, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, name, description, count: 0, createdAt: null };
}

export async function deleteList(id: string) {
  // Remove the list id from every member contact, then drop the list.
  const members = await db().collection(CONTACTS).where("listIds", "array-contains", id).get();
  const chunks = [];
  for (let i = 0; i < members.docs.length; i += 500) {
    chunks.push(members.docs.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = db().batch();
    chunk.forEach((d) =>
      batch.update(d.ref, { listIds: FieldValue.arrayRemove(id) }),
    );
    await batch.commit();
  }
  await db().collection(LISTS).doc(id).delete();
}

// contacts

function toContact(id: string, d: FirebaseFirestore.DocumentData): Contact {
  return {
    id,
    email: d.email,
    firstName: d.firstName ?? "",
    lastName: d.lastName ?? "",
    fields: d.fields ?? {},
    listIds: d.listIds ?? [],
    status: d.status ?? "active",
    createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
    updatedAt: d.updatedAt?.toDate?.().toISOString() ?? null,
  };
}

export async function getContacts(opts: {
  listId?: string;
  limit?: number;
  after?: string; // doc id cursor
}): Promise<{ contacts: Contact[]; next: string | null }> {
  const limit = Math.min(opts.limit ?? 100, 500);
  // ordering by doc id rides the implicit index — array-contains or equality
  // alongside orderBy("email") would demand a composite index we don't have
  let q: FirebaseFirestore.Query = db()
    .collection(CONTACTS)
    .orderBy(FieldPath.documentId())
    .limit(limit + 1);
  if (opts.listId) q = q.where("listIds", "array-contains", opts.listId);
  if (opts.after) {
    const cur = await db().collection(CONTACTS).doc(opts.after).get();
    if (cur.exists) q = q.startAfter(cur);
  }
  const snap = await q.get();
  const docs = snap.docs
    .slice(0, limit)
    .sort((a, b) => String(a.data().email).localeCompare(String(b.data().email)));
  return {
    contacts: docs.map((d) => toContact(d.id, d.data())),
    next: snap.docs.length > limit ? docs[docs.length - 1].id : null,
  };
}

export async function deleteContact(id: string) {
  await db().collection(CONTACTS).doc(id).delete();
}

export interface ImportRow {
  email: string;
  firstName?: string;
  lastName?: string;
  fields?: Record<string, string>;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  invalid: string[];
}

/** Bulk upsert into a list. Doc id = sha256(email) → natural dedupe. */
export async function importContacts(
  listId: string,
  rows: ImportRow[],
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, invalid: [] };
  const col = db().collection(CONTACTS);

  // Filter + normalize first
  const clean = rows
    .map((r) => ({ ...r, email: r.email?.trim().toLowerCase() }))
    .filter((r) => {
      if (!r.email || checkEmail(r.email) !== "ok") {
        if (r.email) result.invalid.push(r.email);
        return false;
      }
      return true;
    });

  // Check which already exist (getAll accepts up to ~300 refs/call)
  const refs = clean.map((r) => col.doc(contactId(r.email)));
  const existing = new Set<string>();
  for (let i = 0; i < refs.length; i += 250) {
    const docs = await db().getAll(...refs.slice(i, i + 250));
    docs.forEach((d) => {
      if (d.exists && (d.data()!.listIds ?? []).includes(listId)) {
        existing.add(d.id);
      }
    });
  }

  // Batched writes (500/commit)
  for (let i = 0; i < clean.length; i += 450) {
    const batch = db().batch();
    for (const row of clean.slice(i, i + 450)) {
      const id = contactId(row.email);
      const ref = col.doc(id);
      if (existing.has(id)) {
        result.skipped++;
        continue;
      }
      batch.set(
        ref,
        {
          email: row.email,
          firstName: row.firstName ?? "",
          lastName: row.lastName ?? "",
          fields: row.fields ?? {},
          listIds: FieldValue.arrayUnion(listId),
          status: "active",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      result.updated++; // set+merge covers both new and existing-not-in-list
    }
    await batch.commit();
  }

  result.added = result.updated; // for the caller: rows written
  if (result.added) {
    await db()
      .collection(LISTS)
      .doc(listId)
      .update({ count: FieldValue.increment(result.added) });
  }
  return result;
}
