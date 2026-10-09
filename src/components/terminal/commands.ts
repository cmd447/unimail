import type { InputMode } from "./engine";
import Papa from "papaparse";
import { htmlToText } from "@/lib/render";
import { parsePaste } from "@/lib/parseleads";
import { spamReport } from "@/lib/spamcheck";

// terminal interface (implemented by engine.tsx)

export interface Term {
  print: (...lines: string[]) => void;
  page: (lines: string[]) => void;
  cls: () => void;
  ask: (
    label: string,
    opts?: {
      secret?: boolean;
      inputMode?: InputMode;
      type?: string;
      allowEmpty?: boolean;
    },
  ) => Promise<string>;
  multi: (hint: string) => Promise<string[]>;
  pickFile: () => Promise<File | null>;
  confirm: (q: string) => Promise<boolean>;
}

export interface Draft {
  subject: string;
  html: string;
  text: string;
}

export interface TermCtx {
  authed: boolean;
  authReason?: string;
  activeProfileId: string | null;
  draft: Draft | null;
}

// helpers

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("not authenticated — type 'login'");
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d;
}

const trunc = (s: unknown, n: number) => {
  const v = String(s ?? "");
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};

function table(head: string[], rows: (string | number)[][]): string[] {
  const all = [head.map(String), ...rows.map((r) => r.map(String))];
  const w = head.map((_, i) =>
    Math.min(34, Math.max(...all.map((r) => (r[i] ?? "").length))),
  );
  const fmt = (r: (string | number)[]) =>
    r.map((c, i) => trunc(c, w[i]).padEnd(w[i])).join("  ");
  const rule = w.map((x) => "-".repeat(x)).join("  ");
  return [fmt(head), rule, ...rows.map(fmt)];
}

/** Numbered pick — returns the chosen index or null. */
async function pick(
  term: Term,
  rows: (string | number)[][],
  headers: string[],
): Promise<number | null> {
  if (!rows.length) {
    term.print("(none)");
    return null;
  }
  term.page(table(headers, rows));
  const v = await term.ask("number: ", { inputMode: "numeric" });
  const n = parseInt(v, 10);
  if (!n || n < 1 || n > rows.length) {
    term.print("aborted.");
    return null;
  }
  return n - 1;
}

function requireAuth(ctx: TermCtx) {
  if (!ctx.authed) {
    throw new Error(`not authenticated${ctx.authReason ? ` (${ctx.authReason})` : ""} — type 'login'`);
  }
}

const arg = (parts: string[], i: number) => parts[i]?.trim();

// command handlers

async function cmdLogin(term: Term, ctx: TermCtx) {
  const pw = await term.ask("Password: ", { secret: true, type: "password" });
  if (!pw) return term.print("aborted.");
  const d = await api("/api/session", {
    method: "POST",
    body: JSON.stringify({ password: pw }),
  }).catch((e) => {
    term.print(e.message);
    return null;
  });
  if (d?.ok) {
    ctx.authed = true;
    const p = await api("/api/profiles");
    ctx.activeProfileId =
      p.profiles.find((x: any) => x.isActive)?.id ??
      p.profiles.find((x: any) => x.isDefault)?.id ??
      null;
    term.print("Access granted. 'help' for commands, 'whoami' for session.");
  }
}

async function cmdProfiles(term: Term, ctx: TermCtx) {
  const { profiles } = await api("/api/profiles");
  if (!profiles.length) return term.print("No profiles — 'profile add' to create one.");
  term.page(
    table(
      ["#", "NAME", "HOST", "PORT", "USER", "FROM", "STATUS", "ACTIVE"],
      profiles.map((p: any, i: number) => [
        i + 1,
        p.name + (p.isDefault ? "*" : ""),
        p.host,
        p.port,
        trunc(p.user, 22),
        trunc(p.fromEmail, 24),
        p.lastError ? "failed" : p.lastVerifiedAt ? "verified" : "unverified",
        p.isActive ? ">>" : "",
      ]),
    ),
  );
}

async function profilesByIndex(term: Term, n: string) {
  const { profiles } = await api("/api/profiles");
  const i = parseInt(n, 10) - 1;
  if (!profiles[i]) throw new Error(`no profile #${n} — run 'profiles'`);
  return profiles[i];
}

async function cmdProfileAdd(term: Term, ctx: TermCtx) {
  const name = await term.ask("Profile name: ");
  if (!name) return term.print("aborted.");
  const host = await term.ask("SMTP host: ", { inputMode: "url" });
  if (!host) return term.print("aborted.");
  const enc = await term.ask("Encryption [1=ssl/465 2=starttls/587 3=none/25]: ", {
    inputMode: "numeric",
  });
  const encryption = enc === "2" ? "starttls" : enc === "3" ? "none" : "ssl";
  const portDef = encryption === "ssl" ? 465 : encryption === "starttls" ? 587 : 25;
  const port =
    parseInt(await term.ask(`Port [${portDef}]: `, { inputMode: "numeric" }), 10) ||
    portDef;
  const user = await term.ask("Username: ", { inputMode: "email" });
  if (!user) return term.print("aborted.");
  const password = await term.ask("Password/app-password: ", {
    secret: true,
    type: "password",
  });
  if (!password) return term.print("aborted.");
  const fromName = await term.ask("From name: ");
  const fromEmail = await term.ask("From email: ", {
    inputMode: "email",
    type: "email",
  });
  const replyTo = await term.ask("Reply-To (blank=skip): ", { inputMode: "email", type: "email" });
  const rateLimit =
    parseInt(await term.ask("Rate limit/min [60]: ", { inputMode: "numeric" }), 10) ||
    60;
  const imapHost = await term.ask("IMAP host for bounces (blank=skip): ", {
    inputMode: "url",
  });
  const imapPort = imapHost
    ? parseInt(await term.ask("IMAP port [993]: ", { inputMode: "numeric" }), 10) ||
      993
    : undefined;

  term.print("saving…");
  const { profile } = await api("/api/profiles", {
    method: "POST",
    body: JSON.stringify({
      name, host, port, encryption, user, password,
      fromName, fromEmail, replyTo, rateLimit, imapHost, imapPort,
    }),
  });
  ctx.activeProfileId ??= profile.id;
  term.print(`saved '${profile.name}' — verifying connection…`);
  const v = await api(`/api/profiles/${profile.id}/verify`, { method: "POST" });
  if (v.ok) term.print("connection OK.");
  else term.print(`verify failed: ${v.error}`);
}

async function cmdTemplateNew(term: Term) {
  const name = await term.ask("Template name: ");
  if (!name) return term.print("aborted.");
  const subject = await term.ask("Subject: ");
  const html = (await term.multi("HTML body — paste lines, '.' alone ends:")).join("\n");
  if (!html.trim()) return term.print("empty body — aborted.");
  const d = await api("/api/templates", {
    method: "POST",
    body: JSON.stringify({ name, subject, html, text: htmlToText(html) }),
  });
  term.print(`template '${d.template.name}' saved.`);
}

async function cmdImport(term: Term, ctx: TermCtx, listIdx: string, mode?: string) {
  const { lists } = await api("/api/lists");
  const list = lists[parseInt(listIdx, 10) - 1];
  if (!list) throw new Error(`no list #${listIdx} — run 'lists'`);

  if (mode === "paste") {
    term.print("dump leads — one per line: email, first, last");
    const lines = await term.multi("paste leads");
    const rows = parsePaste(lines.join("\n"));
    if (!rows.length) return term.print("no valid emails in that.");
    term.print(`${rows.length} leads parsed.`);
    if (!(await term.confirm("proceed?"))) return term.print("aborted.");
    return shipRows(term, list.id, rows);
  }

  term.print("choose a .csv file…");
  const file = await term.pickFile();
  if (!file) return term.print("aborted.");

  const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>(
    (res, rej) =>
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: res,
        error: rej,
      }),
  );
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.filter((r) =>
    Object.values(r).some((v) => v?.trim()),
  );
  if (!rows.length) return term.print("no rows in file.");

  const guess = (h: string) => {
    const s = h.toLowerCase().replace(/[\s_-]/g, "");
    if (/^(e-?mail|mail)$/.test(s)) return "email";
    if (/first/.test(s)) return "firstName";
    if (/last|surname|family/.test(s)) return "lastName";
    return "custom";
  };
  const mapping = Object.fromEntries(headers.map((h) => [h, guess(h)]));

  term.page(
    [
      `${rows.length} rows detected. Column mapping:`,
      "",
      ...table(
        ["COLUMN", "MAPS TO"],
        headers.map((h) => [h, mapping[h]]),
      ),
    ],
  );
  if (!(await term.confirm("proceed?"))) return term.print("aborted.");

  const built = rows.map((r) => {
    const out: any = { email: "", firstName: "", lastName: "", fields: {} };
    for (const [col, target] of Object.entries(mapping)) {
      const v = (r[col] ?? "").trim();
      if (!v) continue;
      if (target === "custom") out.fields[col] = v;
      else out[target] = v;
    }
    return out;
  }).filter((r) => r.email);

  return shipRows(term, list.id, built);
}

async function shipRows(term: Term, listId: string, rows: any[]) {
  let added = 0, skipped = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += 400) {
    term.print(`importing ${i}–${Math.min(i + 400, rows.length)} of ${rows.length}…`);
    const d = await api("/api/contacts/import", {
      method: "POST",
      body: JSON.stringify({ listId, rows: rows.slice(i, i + 400) }),
    });
    added += d.added;
    skipped += d.skipped;
    invalid += d.invalid.length;
  }
  term.print(`done — ${added} imported, ${skipped} dupes skipped, ${invalid} invalid.`);
}

async function cmdCampaignNew(term: Term, ctx: TermCtx) {
  const name = await term.ask("Campaign name: ");
  if (!name) return term.print("aborted.");

  const { profiles } = await api("/api/profiles");
  const pi = await pick(
    term,
    profiles.map((p: any, i: number) => [i + 1, p.name, p.host, p.fromEmail]),
    ["#", "PROFILE", "HOST", "FROM"],
  );
  if (pi === null) return;

  const { lists } = await api("/api/lists");
  const li = await pick(
    term,
    lists.map((l: any, i: number) => [i + 1, l.name, l.count]),
    ["#", "LIST", "CONTACTS"],
  );
  if (li === null) return;

  const { templates } = await api("/api/templates");
  const ti = await pick(
    term,
    templates.map((t: any, i: number) => [i + 1, t.name, trunc(t.subject, 30)]),
    ["#", "TEMPLATE", "SUBJECT"],
  );
  if (ti === null) return;

  const when = await term.ask("Schedule (YYYY-MM-DD HH:mm, blank = now): ");
  const sendNow = !when.trim();

  term.print("expanding recipients…");
  const d = await api("/api/campaigns", {
    method: "POST",
    body: JSON.stringify({
      name,
      profileId: profiles[pi].id,
      listId: lists[li].id,
      templateId: templates[ti].id,
      sendNow,
      scheduledAt: when.trim() ? new Date(when.trim().replace(" ", "T")).toISOString() : undefined,
    }),
  });
  term.print(
    `campaign '${d.campaign.name}' → ${d.total} recipients — status: ${d.campaign.status}`,
  );
  if (d.campaign.status === "sending") term.print("sending… check 'logs' for per-email detail.");
}

async function cmdDraft(term: Term, ctx: TermCtx, parts: string[]) {
  const sub = arg(parts, 1);
  if (!sub) {
    if (!ctx.draft) return term.print("no draft — 'compose' or 'draft html' to start");
    return term.page([
      `subject: ${ctx.draft.subject}`,
      "",
      "--- html ---",
      ...ctx.draft.html.split("\n").map((l) => trunc(l, 100)),
      "",
      "--- text ---",
      ...ctx.draft.text.split("\n").map((l) => trunc(l, 100)),
    ]);
  }
  if (!ctx.draft) ctx.draft = { subject: "", html: "", text: "" };

  if (sub === "subj" || sub === "subject") {
    ctx.draft.subject = parts.slice(2).join(" ");
    term.print(`subject = ${ctx.draft.subject}`);
  } else if (sub === "html") {
    ctx.draft.html = (await term.multi("HTML — '.' alone ends:")).join("\n");
    ctx.draft.text = htmlToText(ctx.draft.html);
    term.print(`${ctx.draft.html.length} chars stored (plain-text derived).`);
  } else if (sub === "text") {
    ctx.draft.text = (await term.multi("plain text — '.' alone ends:")).join("\n");
    term.print("stored.");
  } else if (sub === "save") {
    const name = parts.slice(2).join(" ") || (await term.ask("template name: "));
    await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({ ...ctx.draft, name }),
    });
    term.print(`saved as template '${name}'.`);
  } else if (sub === "clear") {
    ctx.draft = null;
    term.print("draft cleared.");
  } else {
    term.print("usage: draft [subj <t>|html|text|save <n>|clear]");
  }
}

async function cmdSendTest(term: Term, ctx: TermCtx) {
  if (!ctx.draft?.html) return term.print("no draft — 'compose' or 'draft html' first");
  if (!ctx.activeProfileId) return term.print("no active profile — 'profile use <n>'");
  const to = await term.ask("send test to: ", { inputMode: "email", type: "email" });
  if (!to) return term.print("aborted.");
  term.print("sending…");
  const d = await api("/api/send-test", {
    method: "POST",
    body: JSON.stringify({ profileId: ctx.activeProfileId, to, ...ctx.draft }),
  }).catch((e) => ({ ok: false, error: e.message }));
  term.print(d.ok ? `sent — ${d.response ?? ""}` : `failed: ${d.error}`);
}

/** Render one event as full-detail terminal lines — nothing withheld. */
function eventLines(e: any): string[] {
  const t = e.at ? new Date(e.at).toLocaleTimeString("en-GB") : "--:--:--";
  const out = [
    `${t}  ${String(e.status ?? "?").toUpperCase().padEnd(8)} ${e.email ?? "-"}   [${e.campaignName ?? "-"}]`,
    `    ${e.detail ?? ""}`,
  ];
  if (e.meta) {
    for (const [k, v] of Object.entries(e.meta)) {
      if (v === null || v === undefined || v === "") continue;
      out.push(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }
  return out;
}

// registry

const HELP = [
  "UniMail — the sender",
  "",
  "  get in",
  "    login | logout | whoami",
  "  smtp (sender rigs)",
  "    smtp                    list your rigs",
  "    sender add              hook up a new rig",
  "    sender use <n>          go live on a rig",
  "    sender ping <n>         check the line",
  "    sender default <n>      make it the main",
  "    sender yeet <n>         delete",
  "  letters (the html)",
  "    letters                 list",
  "    letter show <n>         print the html",
  "    letter cook             write a new letter",
  "    letter yeet <n>",
  "  draft",
  "    compose                 load a letter into draft",
  "    draft                   peek the draft",
  "    draft subj <text>       set subject",
  "    draft html              paste the letter (multi-line)",
  "    draft text              plain version",
  "    draft save <name>       stash as letter",
  "    sendtest                fire a test at yourself",
  "    spam                    spam score + fixes for the draft",
  "  leads",
  "    leads                   list lead packs",
  "    lead new                new pack",
  "    lead show <n>           see the leads",
  "    lead enrich <n>         resolve real names (api)",
  "    lead yeet <n>",
  "    import <n> [paste]      csv file → leads, or 'import 1 paste' to paste lines",
  "  blasts",
  "    blasts                  list",
  "    blast cook              set up a blast",
  "    blast <n>               stats",
  "    blast send|hold|resume|cancel <n>",
  "    blast export <n>        grab the csv",
  "  ops",
  "    logs [n]                every email, every detail",
  "    settings                house rules",
  "    killswitch on|off       freeze all blasts",
  "    cap <n>                 daily cap (0=off)",
  "    dipped                  leads who bounced/dipped",
  "    ghost <email>           never hit this lead again",
  "    unghost <email>         let them back in",
  "  modes",
  "    website                 switch to the pretty version",
  "  misc",
  "    help | cls | ver | echo | date | time | exit",
  "",
  "  per-lead swaps in letters: {{first_name}} {{name}} {{email}}",
  "  {{unsubscribe_url}} + any custom csv field like {{company}}",
];

const ALIAS: Record<string, string> = {
  leads: "lists", lead: "list",
  letters: "templates", letter: "template",
  blasts: "campaigns", blast: "campaign",
  receipts: "logs",
  dipped: "suppressions", ghosted: "suppressions",
  ghost: "suppress", unghost: "unsuppress",
  senders: "profiles", sender: "profile", smtp: "profiles",
};

export async function runCommand(raw: string, term: Term, ctx: TermCtx) {
  const parts = raw.trim().split(/\s+/);
  const cmd = ALIAS[parts[0].toLowerCase()] ?? parts[0].toLowerCase();
  const SUB_ALIAS: Record<string, string> = {
    ping: "verify", yeet: "del", cook: "new", hold: "pause", call: "cancel",
  };
  const sub = SUB_ALIAS[parts[1]?.toLowerCase()] ?? parts[1]?.toLowerCase();

  switch (cmd) {
    case "help": case "?": term.print(...HELP); return;
    case "cls": case "clear": term.cls(); return;
    case "echo": term.print(parts.slice(1).join(" ")); return;
    case "date": term.print(new Date().toLocaleDateString()); return;
    case "time": term.print(new Date().toLocaleTimeString()); return;
    case "ver":
      term.print("", "UniMail SMTP Engine v1.0", "Next.js + Firestore + Nodemailer", "");
      return;
    case "exit": case "logout": case "logoff":
      await fetch("/api/session", { method: "DELETE" });
      ctx.authed = false;
      ctx.activeProfileId = null;
      term.print("signed out.");
      return;
    case "login": await cmdLogin(term, ctx); return;
    case "website": case "gui": case "ui": {
      if (!ctx.authed) return term.print("login first — 'login'");
      term.print("launching web ui…");
      window.location.assign("/app");
      return;
    }
    case "terminal": return term.print("already in terminal mode.");
    case "whoami": {
      requireAuth(ctx);
      const { profiles } = await api("/api/profiles");
      const active = profiles.find((p: any) => p.isActive);
      term.print(
        "admin",
        active ? `active profile: ${active.name} (${active.fromEmail})` : "no active profile — 'profile use <n>'",
      );
      return;
    }

    // profiles
    case "profiles": requireAuth(ctx); await cmdProfiles(term, ctx); return;
    case "profile": {
      requireAuth(ctx);
      if (sub === "add") return cmdProfileAdd(term, ctx);
      if (sub === "use" || sub === "select") {
        const p = await profilesByIndex(term, arg(parts, 2));
        await api("/api/profiles/select", { method: "POST", body: JSON.stringify({ id: p.id }) });
        ctx.activeProfileId = p.id;
        return term.print(`active profile → ${p.name}`);
      }
      if (sub === "verify") {
        const p = await profilesByIndex(term, arg(parts, 2));
        term.print("verifying…");
        const v = await api(`/api/profiles/${p.id}/verify`, { method: "POST" });
        return term.print(v.ok ? "connection OK" : `failed: ${v.error}`);
      }
      if (sub === "default") {
        const p = await profilesByIndex(term, arg(parts, 2));
        await api(`/api/profiles/${p.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) });
        return term.print(`${p.name} is now default.`);
      }
      if (sub === "del" || sub === "delete") {
        const p = await profilesByIndex(term, arg(parts, 2));
        if (await term.confirm(`delete '${p.name}'?`)) {
          await api(`/api/profiles/${p.id}`, { method: "DELETE" });
          if (ctx.activeProfileId === p.id) ctx.activeProfileId = null;
          return term.print("deleted.");
        }
        return term.print("aborted.");
      }
      return term.print("usage: profile add|use|verify|default|del <n>");
    }

    // templates
    case "templates": {
      requireAuth(ctx);
      const { templates } = await api("/api/templates");
      if (!templates.length) return term.print("none — 'template new'");
      return term.page(
        table(
          ["#", "NAME", "SUBJECT", "UPDATED"],
          templates.map((t: any, i: number) => [
            i + 1, t.name, trunc(t.subject, 30),
            t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "",
          ]),
        ),
      );
    }
    case "template": {
      requireAuth(ctx);
      const { templates } = await api("/api/templates");
      if (sub === "new") return cmdTemplateNew(term);
      const i = parseInt(arg(parts, 2), 10) - 1;
      const t = templates[i];
      if (!t) throw new Error(`no template #${arg(parts, 2)}`);
      if (sub === "show") {
        return term.page([
          `name: ${t.name}`, `subject: ${t.subject}`, "",
          ...t.html.split("\n"),
        ]);
      }
      if (sub === "use") {
        ctx.draft = { subject: t.subject, html: t.html, text: t.text };
        return term.print(`draft ← '${t.name}'. 'draft' to view, 'sendtest' to fire.`);
      }
      if (sub === "del") {
        if (await term.confirm(`delete '${t.name}'?`)) {
          await api(`/api/templates/${t.id}`, { method: "DELETE" });
          return term.print("deleted.");
        }
        return term.print("aborted.");
      }
      return term.print("usage: template new|show|use|del <n>");
    }

    // compose
    case "compose": {
      requireAuth(ctx);
      const { templates } = await api("/api/templates");
      const i = await pick(
        term,
        templates.map((t: any, n: number) => [n + 1, t.name, trunc(t.subject, 30)]),
        ["#", "TEMPLATE", "SUBJECT"],
      );
      if (i === null) return;
      const t = templates[i];
      ctx.draft = { subject: t.subject, html: t.html, text: t.text };
      term.print(`draft ← '${t.name}'`, "'draft' to inspect · 'sendtest' to test · 'draft html' to edit");
      return;
    }
    case "draft": requireAuth(ctx); return cmdDraft(term, ctx, parts);
    case "sendtest": requireAuth(ctx); return cmdSendTest(term, ctx);
    case "spam": case "spamcheck": {
      requireAuth(ctx);
      if (!ctx.draft?.html) return term.print("no letter loaded — 'compose' or 'draft html'");
      const r = spamReport(ctx.draft.subject, ctx.draft.html, ctx.draft.text);
      term.print(
        "",
        `spam score: ${r.score}/100 — ${r.grade === "clean" ? "inbox-bound" : r.grade === "meh" ? "sketchy" : "spam folder bound"}`,
        "",
      );
      if (!r.issues.length) return term.print("clean — nothing tripping filters. ship it.");
      return term.page(
        r.issues.flatMap((i) => [
          `[${i.severity.toUpperCase()}] ${i.message}`,
          `    fix: ${i.fix}`,
        ]),
      );
    }

    // lists
    case "lists": {
      requireAuth(ctx);
      const { lists } = await api("/api/lists");
      if (!lists.length) return term.print("none — 'list new'");
      return term.page(
        table(
          ["#", "NAME", "CONTACTS", "DESCRIPTION"],
          lists.map((l: any, i: number) => [i + 1, l.name, l.count, trunc(l.description, 26)]),
        ),
      );
    }
    case "list": {
      requireAuth(ctx);
      if (sub === "new") {
        const name = await term.ask("list name: ");
        if (!name) return term.print("aborted.");
        const description = await term.ask("description (blank=skip): ");
        await api("/api/lists", { method: "POST", body: JSON.stringify({ name, description }) });
        return term.print(`list '${name}' created.`);
      }
      const { lists } = await api("/api/lists");
      const i = parseInt(arg(parts, 2), 10) - 1;
      const l = lists[i];
      if (!l) throw new Error(`no list #${arg(parts, 2)} — run 'lists'`);
      if (sub === "show") {
        const d = await api(`/api/contacts?listId=${l.id}&limit=50`);
        term.print(`${l.name} — ${l.count} contacts`, "");
        return term.page(
          table(
            ["EMAIL", "NAME", "STATUS"],
            d.contacts.map((c: any) => [
              c.email, trunc([c.firstName, c.lastName].filter(Boolean).join(" "), 24), c.status,
            ]),
          ),
        );
      }
      if (sub === "enrich" || sub === "names") {
        term.print("resolving real names…");
        const d = await api("/api/leads/enrich", {
          method: "POST",
          body: JSON.stringify({ listId: l.id }),
        });
        const src = Object.entries(d.bySource ?? {})
          .map(([k, v]) => `${v} via ${k}`)
          .join(", ");
        return term.print(
          `checked ${d.checked} nameless leads — ${d.resolved} real names found${src ? ` (${src})` : ""}. rest stay on email-guess mode.`,
        );
      }
      if (sub === "del") {
        if (await term.confirm(`yeet pack '${l.name}'?`)) {
          await api(`/api/lists/${l.id}`, { method: "DELETE" });
          return term.print("yeeted.");
        }
        return term.print("nevermind then.");
      }
      return term.print("usage: lead new|show|enrich|yeet <n>");
    }
    case "import": requireAuth(ctx); return cmdImport(term, ctx, arg(parts, 1), arg(parts, 2));

    // campaigns
    case "campaigns": {
      requireAuth(ctx);
      const { campaigns } = await api("/api/campaigns");
      if (!campaigns.length) return term.print("none — 'campaign new'");
      return term.page(
        table(
          ["#", "NAME", "LIST", "STATUS", "DONE/TOTAL", "CREATED"],
          campaigns.map((c: any, i: number) => {
            const k = c.counters;
            return [
              i + 1, trunc(c.name, 20), trunc(c.listName, 16), c.status,
              `${k.sent + k.failed + k.skipped}/${k.total}`,
              c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "",
            ];
          }),
        ),
      );
    }
    case "campaign": {
      requireAuth(ctx);
      if (sub === "new") return cmdCampaignNew(term, ctx);
      const { campaigns } = await api("/api/campaigns");
      const i = parseInt(arg(parts, 2), 10) - 1;
      const c = campaigns[i];
      if (!c) throw new Error(`no campaign #${arg(parts, 2)} — run 'campaigns'`);
      if (["send", "pause", "resume", "cancel"].includes(sub ?? "")) {
        const d = await api(`/api/campaigns/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: sub }),
        });
        return term.print(`→ ${d.campaign.status}`);
      }
      if (sub === "export") {
        term.print("downloading csv…");
        window.open(`/api/campaigns/${c.id}/export`, "_blank");
        return;
      }
      if (sub === "del" || sub === "delete") {
        if (await term.confirm(`delete campaign '${c.name}'?`)) {
          await api(`/api/campaigns/${c.id}`, { method: "DELETE" });
          return term.print("deleted.");
        }
        return term.print("aborted.");
      }
      // bare "campaign <n>" → stats
      const k = c.counters;
      return term.page([
        `name:      ${c.name}`,
        `status:    ${c.status}`,
        `list:      ${c.listName}`,
        `subject:   ${c.subject}`,
        `total:     ${k.total}`,
        `sent:      ${k.sent}`,
        `failed:    ${k.failed}`,
        `skipped:   ${k.skipped}`,
        ...(c.error ? [`error:     ${c.error}`] : []),
        ...(c.scheduledAt ? [`scheduled:  ${new Date(c.scheduledAt).toLocaleString()}`] : []),
      ]);
    }

    // ops
    case "logs": {
      requireAuth(ctx);
      const n = parseInt(arg(parts, 1), 10) || 40;
      const { events } = await api(`/api/events?limit=${n}`);
      if (!events.length) return term.print("no events yet.");
      return term.page(events.flatMap(eventLines));
    }
    case "settings": {
      requireAuth(ctx);
      const { settings } = await api("/api/settings");
      return term.page([
        `kill switch:  ${settings.killSwitch ? "ON — all sending paused" : "off"}`,
        `daily cap:    ${settings.dailyCap || "unlimited"}`,
      ]);
    }
    case "killswitch": {
      requireAuth(ctx);
      const on = sub === "on";
      await api("/api/settings", { method: "PATCH", body: JSON.stringify({ killSwitch: on }) });
      return term.print(on ? "KILL SWITCH ENGAGED — campaigns pause at next batch." : "kill switch off.");
    }
    case "cap": {
      requireAuth(ctx);
      const n = parseInt(arg(parts, 1), 10) || 0;
      await api("/api/settings", { method: "PATCH", body: JSON.stringify({ dailyCap: n }) });
      return term.print(n ? `daily cap → ${n}` : "daily cap off.");
    }
    case "suppressions": {
      requireAuth(ctx);
      const { suppressions } = await api("/api/suppressions");
      if (!suppressions.length) return term.print("none.");
      return term.page(
        table(
          ["EMAIL", "REASON", "DATE"],
          suppressions.map((s: any) => [
            s.email, s.reason,
            s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "",
          ]),
        ),
      );
    }
    case "suppress": {
      requireAuth(ctx);
      const email = arg(parts, 1) || (await term.ask("email: ", { inputMode: "email", type: "email" }));
      await api("/api/suppressions", { method: "POST", body: JSON.stringify({ email }) });
      return term.print(`${email} suppressed.`);
    }
    case "unsuppress": {
      requireAuth(ctx);
      const email = arg(parts, 1);
      await api("/api/suppressions", { method: "DELETE", body: JSON.stringify({ email }) });
      return term.print(`${email} removed from suppressions.`);
    }

    default:
      term.print(`'${cmd}' is not recognized — 'help' for commands.`);
  }
}
