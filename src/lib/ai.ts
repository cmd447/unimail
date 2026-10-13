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

// models sometimes wrap json in prose or fences — dig it out
function parseLoose(raw: string): any {
  const s = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(s);
  } catch {
    /* keep digging */
  }
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const i = s.indexOf(open);
    const j = s.lastIndexOf(close);
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(s.slice(i, j + 1));
      } catch {
        /* try the other shape */
      }
    }
  }
  throw new Error(
    `ai returned non-json — first 120 chars: ${JSON.stringify(raw.slice(0, 120))}`,
  );
}

async function chat(system: string, user: string): Promise<any> {
  const c = await cfg();
  let lastErr: Error = new Error("ai failed");
  // strict json mode first; some models choke on it → retry loose
  for (const jsonMode of [true, false]) {
    const r = await fetch(`${c.base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${c.key}`,
      },
      body: JSON.stringify({
        model: c.model,
        temperature: 0.3,
        max_completion_tokens: 16384,
        // gpt-oss on groq burns tokens on hidden reasoning otherwise
        ...(c.base.includes("groq.com") ? { include_reasoning: false } : {}),
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          {
            role: "system",
            content:
              system +
              "\n\nRespond with ONLY the JSON object. No markdown fences, no reasoning, no commentary — raw JSON.",
          },
          { role: "user", content: user },
        ],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      lastErr = new Error(d.error?.message ?? `ai endpoint http ${r.status}`);
      continue;
    }
    const raw = d.choices?.[0]?.message?.content ?? "";
    try {
      return parseLoose(raw);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("ai failed");
    }
  }
  throw lastErr;
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

export async function aiRewriteLetter(
  d: LetterDraft,
  focus?: string,
): Promise<LetterDraft> {
  const sys = focus
    ? `${SYS_REWRITE}\n\nThis run targets ONE flagged problem only: "${focus}". Change the minimum needed to clear it — leave everything else identical.`
    : SYS_REWRITE;
  const out = await chat(
    sys,
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

/* ------------------------- leads ------------------------- */

const SYS_LEADS = `You turn messy pasted text into a clean contact list.

Extract every email address you can find, in any format:
- bare emails (one per line, comma/space separated)
- "Name <email>" or "email — Name" or vcard/signature dumps
- "email, first, last" csv rows
- json, markdown tables, whatever

Rules:
- every row needs a valid email — skip anything that isn't one
- pull the person's name when it's there (split into first/last); titles, phones, companies, and noise get dropped
- role mailboxes (info@, sales@, noreply@...) get empty names — never invent one
- never make up a name that isn't in the text

Return JSON: {"rows": [{"email": "...", "firstName": "...", "lastName": "..."}]}`;

export async function aiParseLeads(text: string): Promise<
  { email: string; firstName: string; lastName: string }[]
> {
  const out = await chat(SYS_LEADS, text.slice(0, 12000));
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (Array.isArray(out.rows) ? out.rows : [])
    .filter((r: any) => r && EMAIL.test(String(r.email ?? "")))
    .map((r: any) => ({
      email: String(r.email).toLowerCase(),
      firstName: String(r.firstName ?? ""),
      lastName: String(r.lastName ?? ""),
    }));
}
