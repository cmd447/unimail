import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { addSuppression } from "@/lib/suppressions";

/**
 * POST = execute (RFC 8058 one-click from List-Unsubscribe-Post headers,
 * or the confirm form on /unsubscribe).
 * GET  = redirect to the human confirmation page — never executes, because
 *        mail scanners prefetch GET links.
 */
async function handle(campaignId: string, messageId: string) {
  const ref = db()
    .collection("campaigns")
    .doc(campaignId)
    .collection("messages")
    .doc(messageId);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false };

  const email: string = doc.data()!.email;
  await addSuppression(email, "unsubscribed", campaignId);
  await ref.update({ unsubscribedAt: FieldValue.serverTimestamp() });
  await db().collection("events").add({
    campaignId,
    email,
    status: "unsubscribed",
    detail: "recipient opt-out",
    at: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const e = req.nextUrl.searchParams.get("e") ?? "";
  if (e) {
    // one-off sends carry no campaign — suppress by bare email
    await addSuppression(e.toLowerCase(), "unsubscribed", "compose");
    await db().collection("events").add({
      campaignId: "",
      email: e.toLowerCase(),
      status: "unsubscribed",
      detail: "one-off opt-out",
      at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }
  if (!c || !m) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json(await handle(c, m));
}

export async function GET(req: NextRequest) {
  const url = new URL("/unsubscribe", req.url);
  url.search = req.nextUrl.search;
  return NextResponse.redirect(url);
}
