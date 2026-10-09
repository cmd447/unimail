import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { db } from "@/lib/firebase/admin";

type Ctx = { params: Promise<{ id: string }> };

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;

  const rows: string[] = ["email,status,attempts,smtp_response,error,sent_at"];
  const col = db().collection("campaigns").doc(id).collection("messages");
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = col.orderBy("email").limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    last = snap.docs[snap.docs.length - 1];
    for (const d of snap.docs) {
      const m = d.data();
      rows.push(
        [
          csv(m.email),
          csv(m.status),
          csv(m.attempts ?? 0),
          csv(m.smtpResponse),
          csv(m.error),
          csv(m.sentAt?.toDate?.().toISOString()),
        ].join(","),
      );
    }
    if (snap.docs.length < 500) break;
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="campaign-${id}.csv"`,
    },
  });
}
