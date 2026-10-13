"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Area, Badge, Btn, Card, Inp, Note, PageHead, Sel, Tbl, statusColor } from "@/components/web/ui";
import { LogFeed } from "@/components/web/logfeed";
import { mergeData, renderMerge } from "@/lib/render";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useFetch<{ campaign: any }>(`/api/campaigns/${id}`);
  const { data: logData, reload: reloadLogs } = useFetch<{ events: any[] }>(
    `/api/events?campaignId=${id}&limit=300`,
  );
  const { data: queued, reload: reloadQueued } = useFetch<{ messages: any[] }>(
    `/api/campaigns/${id}/messages?status=queued&limit=15`,
  );
  const [msgs, setMsgs] = useState<any[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: "", html: "", text: "" });
  const c = data?.campaign;

  const loadMsgs = useCallback(
    async (after?: string, status = statusFilter) => {
      const d = await api(
        `/api/campaigns/${id}/messages?limit=100${status ? `&status=${status}` : ""}${after ? `&after=${after}` : ""}`,
      );
      setMsgs((m) => (after ? [...m, ...d.messages] : d.messages));
      setNext(d.next);
    },
    [id, statusFilter],
  );

  useEffect(() => {
    setMsgs([]);
    loadMsgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, statusFilter]);

  const act = async (action: string) => {
    setMsg(null);
    try {
      await api(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      reload();
      loadMsgs();
      reloadLogs();
      reloadQueued();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    }
  };

  const probe = async () => {
    setMsg(null);
    try {
      const d = await api("/api/probe", {
        method: "POST",
        body: JSON.stringify({
          profileId: c.profileId,
          subject: c.subject,
          html: c.html,
          text: c.text,
          campaignId: id,
          campaignName: c.name,
        }),
      });
      if (d.ok) {
        setMsg({ text: `test copy sent to ${d.seed} — check placement in ~60s`, ok: true });
        reloadLogs();
      } else {
        setMsg({ text: d.error ?? "probe failed", ok: false });
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "probe failed", ok: false });
    }
  };

  const checkProbes = async () => {
    setMsg(null);
    try {
      const d = await api("/api/probe");
      if (d.error) return setMsg({ text: d.error, ok: false });
      if (!d.configured) return setMsg({ text: "seed imap not set — settings → seed inbox", ok: false });
      setMsg({
        text: d.placed
          ? `resolved ${d.placed} probe${d.placed > 1 ? "s" : ""} — see logs for placement`
          : `scanned seed box — ${d.checked} probe${d.checked === 1 ? "" : "s"} still in transit`,
        ok: true,
      });
      reloadLogs();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "scan failed", ok: false });
    }
  };

  const saveEdit = async () => {
    setMsg(null);
    try {
      await api(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "edit", ...draft }),
      });
      setEditing(false);
      setMsg({ text: "letter updated — queued contacts get the new copy", ok: true });
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    }
  };

  if (!c) return <p className="text-sm text-zinc-600">loading…</p>;
  const k = c.counters;
  const done = k.sent + k.failed + k.skipped;
  const editable = !["completed", "cancelled"].includes(c.status);

  // preview merges like a real send — first queued contact, else a demo lead
  const sample = queued?.messages?.[0] ?? {
    email: "jane.doe@example.com",
    firstName: "Jane",
    lastName: "Doe",
    fields: {},
  };
  const merge = { ...mergeData(sample), unsubscribe_url: "#unsub" };
  const prevHtml = /\{\{\s*unsubscribe_url\s*\}\}/.test(c.html)
    ? renderMerge(c.html, merge)
    : renderMerge(c.html, merge) +
      `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:11px;color:#888">Don't want these emails? <a href="#unsub">Unsubscribe</a></div>`;

  return (
    <div>
      <PageHead title={c.name} sub={`${c.listName} · ${c.subject}`}>
        <Link href="/app/campaigns" className="self-center text-sm text-zinc-500 hover:text-zinc-300">
          ← all sends
        </Link>
        <Btn onClick={() => { reload(); loadMsgs(); reloadLogs(); reloadQueued(); }}>refresh</Btn>
        <Btn onClick={() => setPreview(true)}>[ preview ]</Btn>
        {editable && (
          <Btn
            onClick={() => {
              setDraft({ subject: c.subject, html: c.html, text: c.text });
              setEditing((e) => !e);
            }}
          >
            [ edit letter ]
          </Btn>
        )}
        <Btn onClick={probe}>[ test placement ]</Btn>
        <Btn onClick={checkProbes}>[ check placement ]</Btn>
        {["draft", "scheduled", "failed"].includes(c.status) && (
          <Btn variant="primary" onClick={() => act("send")}>send</Btn>
        )}
        {c.status === "sending" && <Btn onClick={() => act("pause")}>pause</Btn>}
        {c.status === "paused" && (
          <Btn variant="primary" onClick={() => act("resume")}>
            {c.batchSize ? `[ send next ${Math.min(c.batchSize, k?.total ? k.total - (k.sent + k.failed + k.skipped) : c.batchSize)} ]` : "resume"}
          </Btn>
        )}
        {!["completed", "cancelled"].includes(c.status) && (
          <Btn variant="danger" onClick={() => confirm("call this blast off?") && act("cancel")}>
            cancel
          </Btn>
        )}
        <a href={`/api/campaigns/${id}/export`} download>
          <Btn>export csv</Btn>
        </a>
      </PageHead>
      <Note msg={msg} />

      <div className="mb-4 flex items-center gap-3">
        <Badge color={statusColor(c.status)}>{c.status}</Badge>
        {c.error && (
          <span className={`text-xs ${c.status === "failed" ? "text-red-400" : "text-zinc-500"}`}>
            {c.error}
          </span>
        )}
        {c.batchSize > 0 && (
          <span className="text-xs text-zinc-500">
            waves of {c.batchSize}
            {c.status === "sending" && c.batchSent != null &&
              ` · this wave ${c.batchSent}/${c.batchSize}`}
          </span>
        )}
        {c.scheduledAt && (
          <span className="text-xs text-zinc-500">
            sends {new Date(c.scheduledAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Contacts", k.total],
          ["Sent", k.sent],
          ["Failed", k.failed],
          ["Skipped", k.skipped],
          ["Left", k.total - done],
        ].map(([l, v]) => (
          <Card key={l}>
            <div className="text-2xl font-semibold text-zinc-300">{v}</div>
            <div className="text-xs text-zinc-500">{l}</div>
          </Card>
        ))}
      </div>

      {editing && (
        <Card className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-zinc-300">edit the letter</h2>
          <p className="mb-3 text-xs text-zinc-500">
            {["sending", "paused"].includes(c.status)
              ? "applies to contacts still queued — already-sent copies are gone"
              : "edits the copy this blast sends"}
          </p>
          <div className="space-y-3">
            <Inp
              label="subject"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
            <Area
              label="html"
              rows={10}
              value={draft.html}
              onChange={(e) => setDraft({ ...draft, html: e.target.value })}
            />
            <Area
              label="plain text"
              rows={5}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            <div className="flex gap-2">
              <Btn variant="primary" onClick={saveEdit}>[ save letter ]</Btn>
              <Btn onClick={() => setEditing(false)}>cancel</Btn>
            </div>
          </div>
        </Card>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black/90 p-4"
          onClick={() => setPreview(false)}
        >
          <div
            className="mx-auto max-w-2xl border border-zinc-700 bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
              <div className="text-xs text-zinc-500">
                preview — {sample.email}
                {queued?.messages?.[0] ? " (real contact)" : " (demo contact)"}
              </div>
              <Btn onClick={() => setPreview(false)}>close</Btn>
            </div>
            <div className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">
              <div><span className="text-zinc-600">subject:</span> <span className="text-zinc-300">{renderMerge(c.subject, merge)}</span></div>
            </div>
            <div
              className="bg-white p-4 text-sm text-black"
              dangerouslySetInnerHTML={{ __html: prevHtml }}
            />
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">
          logs — click a line for the full receipt
        </h2>
        {(queued?.messages?.length ?? 0) > 0 && (
          <div className="mb-2 border border-zinc-800 px-2 py-1.5 font-mono text-[11px] text-zinc-500">
            <span className="text-sky-400">up next</span>
            {" — "}
            {queued!.messages.map((m) => m.email).join("  ·  ")}
            {c.counters.total - done > queued!.messages.length && (
              <span className="text-zinc-700">
                {"  "}+ {c.counters.total - done - queued!.messages.length} more behind them
              </span>
            )}
          </div>
        )}
        <LogFeed events={logData?.events ?? []} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">contacts</h2>
        <Sel
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-36"
        >
          <option value="">all</option>
          <option value="queued">queued</option>
          <option value="sent">sent</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </Sel>
      </div>

      <Tbl head={["Contact", "Status", "Attempts", "smtp response / error", "Sent"]}>
        {msgs.map((m) => (
          <tr key={m.id}>
            <td className="px-3 py-2 text-zinc-300">{m.email}</td>
            <td className="px-3 py-2">
              <Badge color={statusColor(m.status)}>{m.status}</Badge>
            </td>
            <td className="px-3 py-2 text-zinc-500">{m.attempts}</td>
            <td className="max-w-60 truncate px-3 py-2 text-xs text-zinc-500" title={m.error ?? m.smtpResponse ?? ""}>
              {m.error ?? m.smtpResponse ?? "—"}
            </td>
            <td className="px-3 py-2 text-xs text-zinc-500">
              {m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : "—"}
            </td>
          </tr>
        ))}
        {!msgs.length && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">
              no contacts in this blast
            </td>
          </tr>
        )}
      </Tbl>
      {next && (
        <div className="mt-3 text-center">
          <Btn onClick={() => loadMsgs(next)}>load more</Btn>
        </div>
      )}
    </div>
  );
}
