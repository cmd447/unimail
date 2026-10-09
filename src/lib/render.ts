import type { Contact } from "@/lib/types";

const TAG = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Generic mailbox names — these aren't people, don't invent a name. */
const ROLE_WORDS = new Set([
  "info", "contact", "hello", "hi", "mail", "email", "admin", "support",
  "help", "sales", "office", "team", "service", "services", "care", "careers",
  "jobs", "hr", "billing", "accounts", "account", "noreply", "no-reply",
  "donotreply", "do-not-reply", "postmaster", "webmaster", "news", "newsletter",
  "marketing", "media", "press", "enquiries", "enquiry", "inquiries", "order",
  "orders", "booking", "bookings", "reservations", "register", "signup",
  "welcome", "feedback", "abuse", "security", "legal", "compliance", "test",
  "demo", "user", "users", "staff", "general", "enquiries", "customerservice",
  "customercare", "clientservices", "reception", "frontdesk", "supportteam",
]);

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Guess a lead's name from their email local part.
 *   john.smith@gmail.com → "John Smith"   first="John" last="Smith"
 *   marcus_dev@x.com     → "Marcus Dev"
 *   info@x.com           → "" (role mailbox, no name invented)
 */
export function nameFromEmail(email: string): {
  first: string;
  last: string;
  name: string;
} {
  const local = (email ?? "").split("@")[0].toLowerCase();
  // drop +tag, strip digits, split on separators
  const parts = local
    .split("+")[0]
    .replace(/\d+/g, " ")
    .split(/[._\-\s]+/)
    .map((p) => p.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (!parts.length || parts.every((p) => ROLE_WORDS.has(p))) {
    return { first: "", last: "", name: "" };
  }
  const real = parts.filter((p) => !ROLE_WORDS.has(p));
  const first = cap(real[0]);
  const last = real.slice(1).map(cap).join(" ");
  return { first, last, name: [first, last].filter(Boolean).join(" ") };
}

/**
 * Standard merge-tag values derived from a contact.
 * Missing name fields are auto-filled from the email — real data always wins.
 */
export function mergeData(c: Partial<Contact>): Record<string, string> {
  const derived = nameFromEmail(c.email ?? "");
  const firstName = c.firstName || derived.first;
  const lastName = c.lastName || derived.last;
  return {
    email: c.email ?? "",
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(" "),
    ...(c.fields ?? {}),
  };
}

/** Replace {{tag}} occurrences. Unknown tags are left untouched. */
export function renderMerge(template: string, data: Record<string, string>): string {
  return template.replace(TAG, (m, key) => (key in data ? data[key] : m));
}

/** All {{tags}} present in a template string. */
export function extractTags(template: string): string[] {
  return [...new Set([...template.matchAll(TAG)].map((m) => m[1]))];
}

/** Strip HTML → rough plain-text fallback. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
