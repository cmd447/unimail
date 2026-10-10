const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LeadRow {
  email: string;
  firstName?: string;
  lastName?: string;
  fields?: Record<string, string>;
}

const HEADER_WORDS = /^(first_?name?|last_?name?|fname|lname|surname|email|e-?mail|name)$/i;

// accepts pretty much anything: one email per line, `email, first, last`,
// a raw comma/space-separated dump of addresses, or a mix.
// lines with several emails → each becomes a contact; a single email on a
// line soaks up the other tokens as its name. headers and junk get skipped.
export function parsePaste(text: string): LeadRow[] {
  const rows: LeadRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line
      .split(/[,;\t ]+/)
      .map((p) => p.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    const emails = parts.filter((p) => EMAIL_RE.test(p));
    if (!emails.length) continue;
    if (emails.length > 1) {
      // address dump — every email is its own contact
      for (const e of emails) rows.push({ email: e.toLowerCase(), fields: {} });
      continue;
    }
    const names = parts.filter((p) => !EMAIL_RE.test(p) && !HEADER_WORDS.test(p));
    rows.push({
      email: emails[0].toLowerCase(),
      firstName: names[0] ?? "",
      lastName: names.slice(1).join(" ") || "",
      fields: {},
    });
  }
  return rows;
}

export const guessCol = (h: string) => {
  const s = h.toLowerCase().replace(/[\s_-]/g, "");
  if (/^(e-?mail|mail)$/.test(s)) return "email";
  if (/first|fname|given/.test(s)) return "firstName";
  if (/last|lname|surname|family/.test(s)) return "lastName";
  return "custom";
};

export function rowsFromCsv(parsed: {
  meta: { fields?: string[] };
  data: Record<string, string>[];
}): LeadRow[] {
  const headers = parsed.meta.fields ?? [];
  const mapping = Object.fromEntries(headers.map((h) => [h, guessCol(h)]));
  return parsed.data
    .map((r) => {
      const out: LeadRow = { email: "", firstName: "", lastName: "", fields: {} };
      for (const [col, target] of Object.entries(mapping)) {
        const v = (r[col] ?? "").trim();
        if (!v) continue;
        if (target === "custom") out.fields![col] = v;
        else (out as any)[target] = v;
      }
      out.email = out.email.toLowerCase();
      return out;
    })
    .filter((r) => EMAIL_RE.test(r.email));
}
