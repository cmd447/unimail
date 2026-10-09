"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Btn, Card, Err, Inp, PageHead, Sel } from "@/components/web/ui";
import { importRows } from "@/components/web/importleads";
import { parsePaste } from "@/lib/parseleads";
import { extractTags } from "@/lib/render";
import { spamReport } from "@/lib/spamcheck";

const KV = ({ k, v }: { k: string; v: unknown }) =>
  v === null || v === undefined || v === "" ? null : (
    <div className="grid grid-cols-[92px_1fr] gap-2 border-b border-zinc-900 py-1 text-[11px] last:border-b-0">
      <span className="text-zinc-600">{k}</span>
      <span className="break-all text-zinc-400">{String(v)}</span>
    </div>
  );

const fmtEta = (leads: number, perMin: number) => {
  if (!leads || !perMin) return null;
  const mins = Math.ceil(leads / perMin);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `~${mins} min`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export default function NewCampaign() {
  const router = useRouter();
  const profiles = useFetch<{ profiles: any[] }>("/api/profiles");
  const lists = useFetch<{ lists: any[] }>("/api/lists");
  const templates = useFetch<{ templates: any[] }>("/api/templates");
  const [form, setForm] = useState({
    name: "", profileId: "", listId: "", templateId: "",
    subject: "", rateLimit: "", replyTo: "", fromName: "", scheduledAt: "",
  });
  const [leadSrc, setLeadSrc] = useState<"pack" | "paste">("pack");
  const [paste, setPaste] = useState("");
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rig =
    profiles.data?.profiles.find((p) => p.id === form.profileId) ??
    profiles.data?.profiles.find((p) => p.isActive) ??
    profiles.data?.profiles.find((p) => p.isDefault);
  const pack = lists.data?.lists.find((l) => l.id === form.listId);
  const tpl = templates.data?.templates.find((t) => t.id === form.templateId);

  const pastedRows = leadSrc === "paste" ? parsePaste(paste) : [];
  const leadCount = leadSrc === "pack" ? (pack?.count ?? 0) : pastedRows.length;
  const effRate = parseInt(form.rateLimit, 10) || rig?.rateLimit || 60;
  const eta = fmtEta(leadCount, effRate);
  const subject = form.subject || tpl?.subject || "";
  const report = tpl ? spamReport(subject, tpl.html, tpl.text ?? "") : null;
  const tags = tpl ? extractTags(`${subject} ${tpl.html}`) : [];

  const ready = form.name && form.templateId && rig && leadCount > 0;

  const testFire = async () => {
    if (!testTo || !tpl || !rig) return;
    setMsg(null);
    try {
      const d = await api("/api/send-test", {
        method: "POST",
        body: JSON.stringify({
          profileId: rig.id, to: testTo,
          subject, html: tpl.html, text: tpl.text,
        }),
      });
      setMsg(d.ok ? `test landed at ${testTo} — ${d.response ?? "accepted"}` : `test fumbled: ${d.error}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "test fumbled");
    }
  };

  const create = async (sendNow: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      let listId = form.listId;
      if (leadSrc === "paste") {
        const d = await api("/api/lists", {
          method: "POST",
          body: JSON.stringify({
            name: `${form.name || "blast"} — pasted`,
            description: "ad-hoc paste pack",
          }),
        });
        listId = d.list.id;
        const r = await importRows(listId, pastedRows, () => {});
        if (!r.added) throw new Error("pasted leads all duped/fumbled — nothing to hit");
      }
      const d = await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          profileId: rig!.id,
          listId,
          templateId: form.templateId,
          subject: form.subject || undefined,
          rateLimit: form.rateLimit ? parseInt(form.rateLimit, 10) : undefined,
          replyTo: form.replyTo || undefined,
          fromName: form.fromName || undefined,
          sendNow,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        }),
      });
      router.push(`/app/campaigns/${d.campaign.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="New blast" sub="rig → leads → letter → fire">
        <Link href="/app/campaigns" className="self-center text-sm text-zinc-500 hover:text-zinc-300">
          ← blasts
        </Link>
      </PageHead>
      <Err msg={msg} />

      <Card className="mb-4">
        <Inp
          label="blast name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. october push — cold list"
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 01 — rig */}
        <Card>
          <h3 className="mb-2 border-b border-zinc-800 pb-1 text-xs uppercase tracking-wider text-zinc-500">
            01 · rig
          </h3>
          <Sel
            label="smtp rig"
            value={rig?.id ?? ""}
            onChange={(e) => setForm({ ...form, profileId: e.target.value })}
          >
            <option value="">— pick —</option>
            {profiles.data?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.isActive ? " (active)" : ""}
              </option>
            ))}
          </Sel>
          {rig && (
            <div className="mt-2 px-0">
              <KV k="host" v={`${rig.host}:${rig.port} (${rig.encryption})`} />
              <KV k="login" v={rig.user} />
              <KV k="from" v={rig.fromName ? `"${rig.fromName}" <${rig.fromEmail}>` : rig.fromEmail} />
              <KV k="reply-to" v={rig.replyTo} />
              <KV k="rate" v={`${rig.rateLimit}/min`} />
              <KV k="bounce eye" v={rig.imapHost ? `${rig.imapHost}:${rig.imapPort}` : "off"} />
            </div>
          )}
        </Card>

        {/* 02 — leads */}
        <Card>
          <h3 className="mb-2 border-b border-zinc-800 pb-1 text-xs uppercase tracking-wider text-zinc-500">
            02 · leads
          </h3>
          <div className="mb-2 flex gap-2">
            <Btn onClick={() => setLeadSrc("pack")}>{leadSrc === "pack" ? "• pack •" : "pack"}</Btn>
            <Btn onClick={() => setLeadSrc("paste")}>{leadSrc === "paste" ? "• paste •" : "paste"}</Btn>
          </div>
          {leadSrc === "pack" ? (
            <>
              <Sel value={form.listId} onChange={(e) => setForm({ ...form, listId: e.target.value })}>
                <option value="">— pick a pack —</option>
                {lists.data?.lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.count} leads)</option>
                ))}
              </Sel>
              {pack && (
                <div className="mt-2 px-0">
                  <KV k="pack" v={pack.name} />
                  <KV k="leads" v={pack.count} />
                  <KV k="about" v={pack.description} />
                </div>
              )}
            </>
          ) : (
            <>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={"jane@x.com, Jane, Doe\nboss@corp.io\nmarketing@gmail.com, Marcus"}
                className="w-full border border-zinc-800 bg-black px-3 py-2 font-mono text-xs text-zinc-300 placeholder:text-zinc-700 focus:border-zinc-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-600">
                {pastedRows.length} leads parsed — saves as pack '{form.name || "blast"} — pasted'
              </p>
            </>
          )}
        </Card>

        {/* 03 — letter */}
        <Card>
          <h3 className="mb-2 border-b border-zinc-800 pb-1 text-xs uppercase tracking-wider text-zinc-500">
            03 · letter
          </h3>
          <Sel
            label="letter"
            value={form.templateId}
            onChange={(e) => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">— pick —</option>
            {templates.data?.templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Sel>
          {tpl && (
            <>
              <Inp
                className="mt-2"
                label="subject override (blank = letter's own)"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder={tpl.subject}
              />
              <div className="mt-2 px-0">
                <KV k="spam score" v={
                  report ? `${report.score}/100 — ${report.grade === "clean" ? "inbox-bound" : report.grade === "meh" ? "sketchy" : "spam-bound"}` : "—"
                } />
                <KV k="merges" v={tags.length ? tags.map((t) => `{{${t}}}`).join(" ") : "none"} />
                <KV k="size" v={`${Math.round(new Blob([tpl.html]).size / 1024)}KB html`} />
              </div>
              {report && report.issues.length > 0 && (
                <div className="mt-2 max-h-28 space-y-1 overflow-auto text-[11px]">
                  {report.issues.slice(0, 5).map((i, n) => (
                    <div
                      key={n}
                      className={
                        i.severity === "critical"
                          ? "text-red-400"
                          : i.severity === "warn"
                            ? "text-amber-400"
                            : "text-zinc-500"
                      }
                    >
                      [{i.severity}] {i.message}
                    </div>
                  ))}
                  {report.issues.length > 5 && (
                    <div className="text-zinc-600">+{report.issues.length - 5} more — see compose</div>
                  )}
                </div>
              )}
              <div
                className="mt-2 max-h-40 overflow-auto border border-zinc-800 bg-white p-2 text-[11px] text-black"
                dangerouslySetInnerHTML={{ __html: tpl.html }}
              />
            </>
          )}
        </Card>
      </div>

      {/* 04 — fire */}
      <Card className="mt-4">
        <h3 className="mb-2 border-b border-zinc-800 pb-1 text-xs uppercase tracking-wider text-zinc-500">
          04 · send options
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Inp
            label="rate override /min"
            type="number"
            inputMode="numeric"
            value={form.rateLimit}
            onChange={(e) => setForm({ ...form, rateLimit: e.target.value })}
            placeholder={String(rig?.rateLimit ?? 60)}
          />
          <Inp
            label="from-name override"
            value={form.fromName}
            onChange={(e) => setForm({ ...form, fromName: e.target.value })}
            placeholder={rig?.fromName || "rig's own"}
          />
          <Inp
            label="reply-to override"
            type="email"
            inputMode="email"
            value={form.replyTo}
            onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
            placeholder={rig?.replyTo || "rig's own"}
          />
          <Inp
            label="drop it later"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
        </div>

        <div className="mt-3 px-0">
          <KV k="targets" v={leadCount ? `${leadCount} leads` : null} />
          <KV k="pace" v={`${effRate}/min`} />
          <KV k="eta" v={eta} />
          <KV k="unsub" v="auto footer + List-Unsubscribe headers" />
          <KV k="ghosted" v="suppressed leads auto-skipped" />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Inp
            label="test fire"
            type="email"
            inputMode="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@yourmail.com"
            className="w-56"
          />
          <Btn disabled={!testTo || !tpl || !rig} onClick={testFire}>[ send test ]</Btn>
        </div>

        <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
          <Btn variant="primary" disabled={busy || !ready} onClick={() => create(!form.scheduledAt)}>
            {form.scheduledAt ? "[ schedule the drop ]" : "[ blast now ]"}
          </Btn>
          {!form.scheduledAt && (
            <Btn disabled={busy || !ready} onClick={() => create(false)}>[ stash as draft ]</Btn>
          )}
          {!ready && (
            <span className="self-center text-[11px] text-zinc-600">
              needs: name{!rig && " + rig"}{!form.templateId && " + letter"}{!leadCount && " + leads"}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
