"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Btn, Card, Inp, Note, PageHead, Sel } from "@/components/web/ui";
import { importRows } from "@/components/web/importleads";
import { parsePaste } from "@/lib/parseleads";
import { htmlToText, extractTags } from "@/lib/render";
import { spamReport } from "@/lib/spamcheck";

const KV = ({ k, v }: { k: string; v: unknown }) =>
  v === null || v === undefined || v === "" ? null : (
    <div className="grid grid-cols-[92px_1fr] gap-2 border-b border-zinc-900 py-1 text-[11px] last:border-b-0">
      <span className="text-zinc-600">{k}</span>
      <span className="break-all text-zinc-400">{String(v)}</span>
    </div>
  );

const fmtEta = (contacts: number, perMin: number) => {
  if (!contacts || !perMin) return null;
  const mins = Math.ceil(contacts / perMin);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `~${mins} min`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export default function NewCampaign() {
  const router = useRouter();
  const profiles = useFetch<{ profiles: any[] }>("/api/profiles");
  const lists = useFetch<{ lists: any[] }>("/api/lists");
  const [form, setForm] = useState({
    name: "", profileId: "", listId: "",
    subject: "", rateLimit: "", replyTo: "", fromName: "", scheduledAt: "",
    batchSize: "",
  });
  const [content, setContent] = useState({ html: "", text: "" });
  const [contentTab, setContentTab] = useState<"html" | "preview" | "plain">("html");
  const [leadSrc, setLeadSrc] = useState<"list" | "paste">("list");
  const [paste, setPaste] = useState("");
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const sender = profiles.data?.profiles.find((p) => p.id === form.profileId);
  const list = lists.data?.lists.find((l) => l.id === form.listId);

  const pastedRows = leadSrc === "paste" ? parsePaste(paste) : [];
  const leadCount = leadSrc === "list" ? (list?.count ?? 0) : pastedRows.length;
  const effRate = parseInt(form.rateLimit, 10) || sender?.rateLimit || 60;
  const eta = fmtEta(leadCount, effRate);
  const subject = form.subject;
  const report = content.html ? spamReport(subject, content.html, content.text) : null;
  const tags = content.html ? extractTags(`${subject} ${content.html}`) : [];

  const ready = form.name && form.subject && (content.html || content.text) && sender && leadCount > 0;

  const testFire = async () => {
    if (!testTo || !sender || !subject || (!content.html && !content.text)) return;
    setMsg(null);
    const isPlain = contentTab === "plain";
    try {
      const d = await api("/api/send-test", {
        method: "POST",
        body: JSON.stringify({
          profileId: sender.id, to: testTo, subject,
          plainOnly: isPlain,
          ...(isPlain ? { text: content.text } : { html: content.html }),
        }),
      });
      setMsg(d.ok ? { text: `test sent ${d.mode ?? ""} to ${testTo} — ${d.response ?? "accepted"}`, ok: true } : { text: `test failed: ${d.error}`, ok: false });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "test failed", ok: false });
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
            name: `${form.name || "campaign"} — pasted`,
            description: "ad-hoc paste list",
          }),
        });
        listId = d.list.id;
        const r = await importRows(listId, pastedRows, () => {});
        if (!r.added) throw new Error("pasted contacts all duped/failed — nothing to hit");
      }
      const blastText = content.text || htmlToText(content.html);
      const d = await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          profileId: sender!.id,
          listId,
          subject: form.subject,
          html: content.html || undefined,
          text: blastText || undefined,
          rateLimit: form.rateLimit ? parseInt(form.rateLimit, 10) : undefined,
          batchSize: form.batchSize ? parseInt(form.batchSize, 10) : undefined,
          replyTo: form.replyTo || undefined,
          fromName: form.fromName || undefined,
          sendNow,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        }),
      });
      router.push(`/app/campaigns/${d.campaign.id}`);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="New campaign" sub="sender → contacts → template → send">
        <Link href="/app/campaigns" className="self-center text-sm text-zinc-500 hover:text-zinc-300">
          ← campaigns
        </Link>
      </PageHead>
      <Note msg={msg} />

      <Card className="mb-4">
        <Inp
          label="campaign name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. october push — cold list"
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 01 — sender */}
        <Card>
          <h3 className="mb-3 border-b border-zinc-800/70 pb-2 text-[13px] font-medium text-zinc-300">
            01 · Sender
          </h3>
          <Sel
            label="smtp sender"
            value={form.profileId}
            onChange={(e) => setForm({ ...form, profileId: e.target.value })}
          >
            <option value="">— pick —</option>
            {profiles.data?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.fromEmail})
              </option>
            ))}
          </Sel>
          {sender && (
            <div className="mt-2 px-0">
              <KV k="host" v={`${sender.host}:${sender.port} (${sender.encryption})`} />
              <KV k="login" v={sender.user} />
              <KV k="from" v={sender.fromName ? `"${sender.fromName}" <${sender.fromEmail}>` : sender.fromEmail} />
              <KV k="reply-to" v={sender.replyTo} />
              <KV k="rate" v={`${sender.rateLimit}/min`} />
              <KV k="bounce scan" v={sender.imapHost ? `${sender.imapHost}:${sender.imapPort}` : "off"} />
            </div>
          )}
        </Card>

        {/* 02 — contacts */}
        <Card>
          <h3 className="mb-3 border-b border-zinc-800/70 pb-2 text-[13px] font-medium text-zinc-300">
            02 · Contacts
          </h3>
          <div className="mb-3 inline-flex rounded-md border border-zinc-700 p-0.5">
            {(["list", "paste"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setLeadSrc(s)}
                className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  leadSrc === s
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {leadSrc === "list" ? (
            <>
              <Sel value={form.listId} onChange={(e) => setForm({ ...form, listId: e.target.value })}>
                <option value="">— pick a list —</option>
                {lists.data?.lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.count} contacts)</option>
                ))}
              </Sel>
              {list && (
                <div className="mt-2 px-0">
                  <KV k="list" v={list.name} />
                  <KV k="contacts" v={list.count} />
                  <KV k="about" v={list.description} />
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
                placeholder={"a@x.com,b@y.com,c@z.com\njane@x.com, Jane, Doe\nboss@corp.io"}
                className="editor text-xs"
              />
              <p className="mt-1 text-[11px] text-zinc-600">
                {pastedRows.length} contacts parsed — saves as list '{form.name || "blast"} — pasted'
              </p>
            </>
          )}
        </Card>

        {/* 03 — content */}
        <Card>
          <h3 className="mb-3 border-b border-zinc-800/70 pb-2 text-[13px] font-medium text-zinc-300">
            03 · Content
          </h3>
          <Inp
            label="subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="subject line — {{first_name}} works"
          />
          <div className="mt-3 inline-flex rounded-md border border-zinc-700 p-0.5">
            {(["html", "preview", "plain"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setContentTab(t)}
                className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  contentTab === t
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {contentTab === "html" && (
            <textarea
              value={content.html}
              onChange={(e) =>
                setContent((c) => ({
                  ...c,
                  html: e.target.value,
                  text: c.text || htmlToText(e.target.value),
                }))
              }
              rows={10}
              spellCheck={false}
              className="editor mt-2"
              placeholder="paste your html here…"
            />
          )}
          {contentTab === "preview" && (
            <div
              className="mt-2 max-h-48 overflow-auto border border-zinc-800 bg-white p-2 text-[11px] text-black"
              dangerouslySetInnerHTML={{ __html: content.html }}
            />
          )}
          {contentTab === "plain" && (
            <textarea
              value={content.text}
              onChange={(e) => setContent((c) => ({ ...c, text: e.target.value }))}
              rows={10}
              spellCheck={false}
              className="editor mt-2"
              placeholder="type or paste your plain-text message…"
            />
          )}
          {content.html && (
            <div className="mt-2 px-0">
              <KV k="spam score" v={
                report ? `${report.score}/100 — ${report.grade === "clean" ? "looks clean" : report.grade === "meh" ? "sketchy" : "spam-bound"}` : "—"
              } />
              <KV k="merges" v={tags.length ? tags.map((t) => `{{${t}}}`).join(" ") : "none"} />
              <KV k="size" v={`${Math.round(new Blob([content.html]).size / 1024)}KB html`} />
            </div>
          )}
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
                <div className="text-zinc-600">+{report.issues.length - 5} more</div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* 04 — send */}
      <Card className="mt-4">
        <h3 className="mb-3 border-b border-zinc-800/70 pb-2 text-[13px] font-medium text-zinc-300">
          04 · Send options
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Inp
            label="send speed /min"
            type="number"
            inputMode="numeric"
            value={form.rateLimit}
            onChange={(e) => setForm({ ...form, rateLimit: e.target.value })}
            placeholder={String(sender?.rateLimit ?? 60)}
          />
          <Inp
            label="send in waves of (blank = all at once)"
            type="number"
            inputMode="numeric"
            value={form.batchSize}
            onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
            placeholder="e.g. 50"
          />
          <Inp
            label="from-name override"
            value={form.fromName}
            onChange={(e) => setForm({ ...form, fromName: e.target.value })}
            placeholder={sender?.fromName || "sender's own"}
          />
          <Inp
            label="reply-to override"
            type="email"
            inputMode="email"
            value={form.replyTo}
            onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
            placeholder={sender?.replyTo || "sender's own"}
          />
          <Inp
            label="send later (pick a time)"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
        </div>

        <div className="mt-3 px-0">
          <KV k="targets" v={leadCount ? `${leadCount} contacts` : null} />
          <KV k="pace" v={`${effRate}/min`} />
          <KV k="eta" v={eta} />
          <KV
            k="waves"
            v={
              form.batchSize && leadCount
                ? `${Math.min(parseInt(form.batchSize, 10) || 0, leadCount)} now — then ${Math.max(0, Math.ceil(leadCount / (parseInt(form.batchSize, 10) || leadCount)) - 1)} more on click`
                : "all at once"
            }
          />
          <KV k="unsub" v="auto footer + List-Unsubscribe headers" />
          <KV k="suppressed" v="suppressed contacts auto-skipped" />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Inp
            label="send a test to"
            type="email"
            inputMode="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@yourmail.com"
            className="w-56"
          />
          <Btn disabled={!testTo || !sender || !subject || (!content.html && !content.text)} onClick={testFire}>Send test</Btn>
        </div>

        <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
          <Btn variant="primary" disabled={busy || !ready} onClick={() => create(!form.scheduledAt)}>
            {form.scheduledAt ? "Schedule send" : "Send now"}
          </Btn>
          {!form.scheduledAt && (
            <Btn disabled={busy || !ready} onClick={() => create(false)}>Save as draft</Btn>
          )}
          {!ready && (
            <span className="self-center text-[11px] text-zinc-600">
              needs: name{!form.subject && " + subject"}{!sender && " + sender"}{!(content.html || content.text) && " + content"}{!leadCount && " + contacts"}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
