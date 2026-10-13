import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import { requireApiSession } from "@/lib/api";
import { getProfile } from "@/lib/profiles";

type Ctx = { params: Promise<{ id: string }> };
type Check = { label: string; state: "ok" | "warn" | "fail" | "info"; detail: string };

const FREE = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "aol.com", "icloud.com", "me.com", "proton.me",
  "protonmail.com", "zoho.com", "gmx.com", "mail.com",
]);

async function txtRecords(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

const stripSub = (h: string) =>
  h.toLowerCase().replace(/^(smtp|mail|email|smtp-relay|relay|outbound|mta|mx|send|email-smtp|smtpout)\./, "");

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { id } = await ctx.params;
  const p = await getProfile(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checks: Check[] = [];
  const fromDom = (p.fromEmail.split("@")[1] ?? "").toLowerCase().trim();
  const userDom = p.user.includes("@") ? p.user.split("@")[1].toLowerCase() : "";
  const hostDom = stripSub(p.host);

  if (!fromDom) {
    checks.push({
      label: "from email",
      state: "fail",
      detail: `${p.fromEmail} is malformed — set a real from email on the sender`,
    });
  } else {
    // mx — can the domain receive replies at all
    try {
      const mx = await dns.resolveMx(fromDom);
      checks.push(
        mx.length
          ? { label: "mx", state: "ok", detail: `${fromDom} receives mail (${mx[0].exchange})` }
          : { label: "mx", state: "fail", detail: `${fromDom} has no MX — replies bounce and some filters flag it` },
      );
    } catch {
      checks.push({
        label: "mx",
        state: "fail",
        detail: `${fromDom} has no MX records — the domain can't receive mail`,
      });
    }

    // spf — our envelope sender defaults to the from address, so this is THE spf domain
    const txts = await txtRecords(fromDom);
    const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1"));
    checks.push(
      spf
        ? { label: "spf", state: "ok", detail: spf.length > 110 ? `${spf.slice(0, 110)}…` : spf }
        : {
            label: "spf",
            state: "warn",
            detail: `no SPF record on ${fromDom} — receivers can't verify who's allowed to send for it`,
          },
    );

    // dmarc
    const dmarc = (await txtRecords(`_dmarc.${fromDom}`)).find((t) =>
      t.toLowerCase().startsWith("v=dmarc1"),
    );
    checks.push(
      dmarc
        ? { label: "dmarc", state: "ok", detail: dmarc.length > 110 ? `${dmarc.slice(0, 110)}…` : dmarc }
        : {
            label: "dmarc",
            state: "warn",
            detail: `no _dmarc record on ${fromDom} — even "v=DMARC1; p=none" beats nothing`,
          },
    );

    // alignment — does the signing path plausibly match the from domain
    if (FREE.has(fromDom)) {
      checks.push({
        label: "alignment",
        state: "ok",
        detail: `@${fromDom} is provider-signed — dkim/dmarc align by default. the catch: free mailboxes trip volume filters fast, and recipients see a free address`,
      });
    } else if (userDom && userDom !== fromDom && fromDom !== hostDom) {
      checks.push({
        label: "alignment",
        state: "warn",
        detail: `from ${fromDom} but you log in as ${userDom} via ${hostDom} — unless the provider signs DKIM for ${fromDom} specifically, dmarc alignment fails → straight to spam`,
      });
    } else if (fromDom !== hostDom) {
      checks.push({
        label: "alignment",
        state: "warn",
        detail: `from ${fromDom} while sending through ${hostDom} — make sure the provider signs DKIM as ${fromDom} (their domain-auth step), not as ${hostDom}`,
      });
    } else {
      checks.push({
        label: "alignment",
        state: "ok",
        detail: `${fromDom} lines up with the sending service`,
      });
    }

    // provider-specific tells
    if (fromDom === "gmail.com" && hostDom !== "gmail.com") {
      checks.push({
        label: "forgery",
        state: "fail",
        detail: `From is @gmail.com but sending through ${hostDom} — gmail signs gmail.com, so DKIM/SPF/DMARC all fail here. guaranteed spam or outright reject`,
      });
    } else if (FREE.has(fromDom) && hostDom !== fromDom && !hostDom.includes(fromDom.split(".")[0])) {
      checks.push({
        label: "forgery",
        state: "fail",
        detail: `a @${fromDom} address sent through ${hostDom} fails every auth check — send through ${fromDom}'s own smtp or use a custom domain`,
      });
    }
  }

  checks.push({
    label: "reality",
    state: "info",
    detail:
      "clean DNS + dkim is table stakes, not a ticket — a fresh sender/domain has zero reputation, so cold volume still lands spam. low counts, real replies, ramp slowly",
  });

  return NextResponse.json({ checks });
}
