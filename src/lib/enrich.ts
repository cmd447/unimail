import crypto from "crypto";

const TIMEOUT_MS = 4000;

export interface EnrichHit {
  firstName: string;
  lastName: string;
  name: string;
  source: "hunter" | "gravatar";
}

/** Hunter.io email verifier — returns names when their DB knows the address. */
async function hunter(email: string): Promise<EnrichHit | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${key}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const d = await r.json();
    const first = d?.data?.first_name ?? "";
    const last = d?.data?.last_name ?? "";
    if (!first) return null;
    return {
      firstName: first,
      lastName: last,
      name: [first, last].filter(Boolean).join(" "),
      source: "hunter",
    };
  } catch {
    return null;
  }
}

/** Gravatar profile lookup — free, no key, spotty coverage. */
async function gravatar(email: string): Promise<EnrichHit | null> {
  const hash = crypto
    .createHash("md5")
    .update(email.trim().toLowerCase())
    .digest("hex");
  try {
    const r = await fetch(`https://www.gravatar.com/${hash}.json`, {
      headers: { "user-agent": "unimail/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const e = d?.entry?.[0];
    if (!e) return null;
    const first: string = e.name?.givenName ?? "";
    const last: string = e.name?.familyName ?? "";
    const formatted: string = e.name?.formatted ?? "";
    const display: string = e.displayName ?? e.preferredUsername ?? "";
    const name = formatted || display;
    if (!first && !name) return null;
    return {
      firstName: first || name.split(" ")[0],
      lastName: last,
      name: name || first,
      source: "gravatar",
    };
  } catch {
    return null;
  }
}

/** Best-effort real-name lookup for an email. Null = unknown. */
export async function enrichEmail(email: string): Promise<EnrichHit | null> {
  return (await hunter(email)) ?? (await gravatar(email));
}
