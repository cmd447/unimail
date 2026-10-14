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
  const { profileId, to, subject, html, text, firstName, lastName, plainOnly } = body;

  if (!profileId || !to || !subject || !html) {
    return NextResponse.json(
      { error: "Missing profileId/to/subject/html" },
      { status: 400 },
    );
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const data = {
    ...mergeData({ email: to, firstName, lastName }),
    unsubscribe_url: `${appUrl}/unsubscribe?e=${encodeURIComponent(to)}`,
  };

  try {
    const plainText = renderMerge(text ?? "", data) || htmlToText(renderMerge(html, data));
    const info = await sendMail(profileId, {
      to,
      subject: renderMerge(subject, data),
      ...(plainOnly ? {} : { html: renderMerge(html, data) }),
      text: plainText,
    });
    return NextResponse.json({
      ok: true,
      messageId: info.messageId,
      response: info.response,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Send failed" },
      { status: 502 },
    );
  }
}
