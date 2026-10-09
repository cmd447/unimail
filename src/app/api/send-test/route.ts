import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api";
import { sendMail } from "@/lib/mailer";
import { renderMerge } from "@/lib/render";

const SAMPLE = {
  email: "recipient@example.com",
  first_name: "Jane",
  last_name: "Doe",
  name: "Jane Doe",
};

export async function POST(req: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const { profileId, to, subject, html, text } = body;

  if (!profileId || !to || !subject || !html) {
    return NextResponse.json(
      { error: "Missing profileId/to/subject/html" },
      { status: 400 },
    );
  }

  try {
    const info = await sendMail(profileId, {
      to,
      subject: `[TEST] ${renderMerge(subject, SAMPLE)}`,
      html: renderMerge(html, SAMPLE),
      text: renderMerge(text ?? "", SAMPLE),
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
