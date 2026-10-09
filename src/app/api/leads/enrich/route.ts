import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { db } from "@/lib/firebase/admin";
import { getContacts } from "@/lib/lists";
import { enrichEmail } from "@/lib/enrich";

const CONCURRENCY = 6;
const MAX_SCAN = 2000;

/**
 * POST { listId } — resolve real names for leads missing firstName.
 * Tries Hunter (if HUNTER_API_KEY) then Gravatar; stores hits on the contact.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { listId } = (await req.json().catch(() => ({}))) as { listId?: string };
  if (!listId) return NextResponse.json({ error: "Missing listId" }, { status: 400 });

  // Collect contacts missing a first name (and not already resolved)
  const targets: { id: string; email: string }[] = [];
  let after: string | null = null;
  do {
    const page = await getContacts({ listId, limit: 500, after: after ?? undefined });
    for (const c of page.contacts) {
      if (!c.firstName && !(c.fields as any)?.name_resolved) {
        targets.push({ id: c.id, email: c.email });
      }
    }
    after = page.next;
  } while (after && targets.length < MAX_SCAN);

  const col = db().collection("contacts");
  const queue = [...targets];
  let checked = 0;
  let resolved = 0;
  const bySource: Record<string, number> = {};

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const c = queue.pop()!;
        checked++;
        const hit = await enrichEmail(c.email);
        if (hit) {
          resolved++;
          bySource[hit.source] = (bySource[hit.source] ?? 0) + 1;
          await col.doc(c.id).update({
            firstName: hit.firstName || hit.name.split(" ")[0],
            lastName: hit.lastName,
            "fields.name_resolved": hit.source,
          });
        } else {
          await col.doc(c.id).update({ "fields.name_resolved": "miss" });
        }
      }
    }),
  );

  return NextResponse.json({
    checked,
    resolved,
    bySource,
    skipped: targets.length - checked,
  });
}
