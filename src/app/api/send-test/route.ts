import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { sendMail } from "@/lib/mailer";
import { htmlToText, mergeData, renderMerge } from "@/lib/render";

// one-to-one send — merge tags resolve against the actual recipient,
// falling back to names guessed from the email local part
export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const { profileId, to, subject, html, text, firstName, lastName, plainOnly, fromName, replyTo, priority } = body;

  if (!profileId || !to || !subject) {
    return NextResponse.json(
      { error: "Missing profileId/to/subject" },
      { status: 400 },
    );
  }
  if (plainOnly && !text) {
    return NextResponse.json({ error: "Missing text content" }, { status: 400 });
  }
  if (!plainOnly && !html) {
    return NextResponse.json(
      { error: "Missing html — switch to plain tab for text-only" },
      { status: 400 },
    );
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const data = {
    ...mergeData({ email: to, firstName, lastName }),
    unsubscribe_url: `${appUrl}/unsubscribe?e=${encodeURIComponent(to)}`,
  };

  try {
    // plain mode: send the user's text as-is, no html part
    // html mode: ALWAYS derive the text fallback from the html —
    // a mismatched text part ("hi" when html is a full letter) is a spam signal
    const renderedHtml = html ? renderMerge(html, data) : "";
    const plainText = plainOnly
      ? renderMerge(text, data)
      : htmlToText(renderedHtml);
    const info = await sendMail(profileId, {
      to,
      subject: renderMerge(subject, data),
      ...(plainOnly ? {} : { html: renderedHtml }),
      text: plainText,
      ...(fromName && { fromName }),
      ...(replyTo && { replyTo }),
      ...((priority === "high" || priority === "low") && { priority }),
    });
    return NextResponse.json({
      ok: true,
      messageId: info.messageId,
      response: info.response,
      mode: plainOnly ? "plain" : "html",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Send failed" },
      { status: 502 },
    );
  }
}
