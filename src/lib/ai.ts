import { htmlToText } from "@/lib/render";
import { getSettings } from "@/lib/settings";
import { decrypt } from "@/lib/crypto";

const BASE = () =>
  (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const KEY = () => process.env.AI_API_KEY || "";
const MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";

// settings doc wins over env so the key can be rotated without a redeploy
async function cfg() {
  const s = await getSettings().catch(() => null);
  return {
    base: s?.aiBaseUrl || BASE(),
    key: s?.aiKeyEnc ? decrypt(s.aiKeyEnc) : KEY(),
    model: s?.aiModel || MODEL(),
  };
}

export const aiEnabled = async () => Boolean((await cfg()).key);

async function chat(system: string, user: string): Promise<any> {
  const c = await cfg();
  const r = await fetch(`${c.base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${c.key}`,
    },
    body: JSON.stringify({
      model: c.model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(d.error?.message ?? `ai endpoint http ${r.status}`);
  const raw = d.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("ai didn't return clean json — try again");
  }
}

const SYS_REWRITE = `You rewrite marketing emails so they land in the inbox instead of the spam folder.

Rules:
- Keep the actual offer, the CTA, and roughly the same length and structure.
- Strip spam-trigger phrasing: hype claims, urgency pressure, all-caps words, exclamation spam, money-bait, guaranteed results, fake familiarity.
- Write like a person emailing another person — not a brand shouting.
- Every {{merge_tag}} in the input must appear verbatim in the output. Never alter, translate, or drop them.
- Keep every link (same href) and keep the unsubscribe footer if present.
- Valid HTML only in the html field — no markdown, no code fences.

Reply as JSON: {"subject": "...", "html": "..."}`;

const SYS_JUDGE = `You grade marketing emails the way Gmail's spam filter would. Score 0-100 (100 = certain inbox, 0 = spam folder).

Check: spam phrases, urgency pressure, fake personalization, scam patterns (crypto, prizes, pharma), link profile and anchor honesty, image-only bodies, missing unsubscribe or postal address, obfuscation tricks, and whether it reads like a template or a human.

Return JSON: {"score": number, "issues": [{"severity": "critical"|"warn"|"info", "message": "short flag", "fix": "what to change"}]}
Max 8 issues, most important first. If the email is clean, issues can be empty.`;

export interface LetterDraft {
  subject: string;
  html: string;
  text: string;
}

export async function aiRewriteLetter(d: LetterDraft): Promise<LetterDraft> {
  const out = await chat(
    SYS_REWRITE,
    JSON.stringify({ subject: d.subject, html: d.html }),
  );
  const subject = String(out.subject ?? d.subject);
  const html = String(out.html ?? d.html);
  // merge tags are load-bearing — refuse a rewrite that ate one
  const before = new Set(
    [...(d.subject + " " + d.html).matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]),
  );
  const missing = [...before].filter(
    (t) => !subject.includes(t) && !html.includes(t),
  );
  if (missing.length)
    throw new Error(`ai dropped ${missing.join(", ")} — run it again`);
  return { subject, html, text: htmlToText(html) };
}

export interface AiIssue {
  severity: "critical" | "warn" | "info";
  message: string;
  fix: string;
}

export async function aiJudgeLetter(d: LetterDraft): Promise<{ score: number; issues: AiIssue[] }> {
  const out = await chat(
    SYS_JUDGE,
    JSON.stringify({ subject: d.subject, html: d.html, text: d.text }),
  );
  const score = Math.max(0, Math.min(100, Number(out.score) || 0));
  const issues = (Array.isArray(out.issues) ? out.issues : [])
    .filter((i: any) => i && typeof i.message === "string")
    .slice(0, 8)
    .map((i: any) => ({
      severity: ["critical", "warn", "info"].includes(i.severity) ? i.severity : "info",
      message: String(i.message),
      fix: String(i.fix ?? ""),
    }));
  return { score, issues };
}
