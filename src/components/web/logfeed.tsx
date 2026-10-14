"use client";

import { useState } from "react";
import { api } from "@/components/web/api";
import { Btn, Card } from "@/components/web/ui";

export const LOG_COLOR: Record<string, string> = {
  sent: "text-signal",
  sending: "text-sky-400",
  failed: "text-hazard",
  bounced: "text-hazard",
  skipped: "text-amber-400",
  probe: "text-fuchsia-400",
  chain: "text-amber-400",
  "tick-failed": "text-hazard",
};

const ROW = ({ k, v }: { k: string; v: unknown }) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) ? null : (
    <div className="grid gap-0 border-b border-hairline py-1 text-[11px] sm:grid-cols-[130px_1fr] sm:gap-2">
      <span className="text-zinc-600">{k}</span>
      <span className="break-all text-zinc-300">
        {typeof v === "object" ? JSON.stringify(v) : String(v)}
      </span>
    </div>
  );

export function LogDetail({
  event,
  onClose,
}: {
  event: any;
  onClose: () => void;
}) {
  const [msg, setMsg] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"letter" | "plain" | "raw">("letter");
  const [fetched, setFetched] = useState(false);

  const mid = event?.meta?.messageId;
  if (mid && event.campaignId && !fetched) {
    setFetched(true);
    api(`/api/message?c=${event.campaignId}&m=${mid}`)
      .then((d) => setMsg(d.message))
      .catch((e) => setErr(e instanceof Error ? e.message : "fetch failed"));
  }

  if (!event) return null;
  const r = msg?.rendered;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/90 p-4 font-mono">
      <Card className="mx-auto max-w-4xl border-hairline-strong p-4">
        <div className="mb-3 flex items-center justify-between border-b border-hairline pb-2">
          <div>
            <span className={`font-bold uppercase ${LOG_COLOR[event.status] ?? "text-zinc-300"}`}>
              {event.status}
            </span>
            <span className="ml-3 text-zinc-200">{event.email}</span>
            <span className="ml-3 text-xs text-zinc-600">
              {event.at ? new Date(event.at).toLocaleString("en-GB") : ""}
            </span>
          </div>
          <Btn onClick={onClose}>Close</Btn>
        </div>

        <h3 className="mb-1 text-xs text-zinc-500">Delivery receipt</h3>
        <div className="mb-4 border border-hairline px-2">
          <ROW k="blast" v={event.campaignName} />
          <ROW k="detail" v={event.detail} />
          {Object.entries(event.meta ?? {}).map(([k, v]) => (
            <ROW key={k} k={k} v={v} />
          ))}
          {msg && (
            <>
              <ROW k="contact first" v={msg.firstName} />
              <ROW k="contact last" v={msg.lastName} />
              <ROW k="contact fields" v={msg.fields && Object.keys(msg.fields).length ? msg.fields : null} />
              <ROW k="attempts" v={msg.attempts} />
              <ROW k="sent at" v={msg.sentAt} />
              <ROW k="error" v={msg.error} />
            </>
          )}
        </div>

        {err && <p className="mb-3 text-xs text-red-400">ERROR: {err}</p>}
        {!mid && (
          <p className="text-xs text-zinc-600">
            this log predates message tracking — smtp metadata above is all that's stored.
          </p>
        )}
        {mid && !msg && !err && (
          <p className="text-xs text-zinc-600">loading letter…</p>
        )}

        {r && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs text-zinc-500">The email as sent</h3>
              <Btn onClick={() => setView("letter")} variant={view === "letter" ? "primary" : "suppress"}>HTML</Btn>
              <Btn onClick={() => setView("plain")} variant={view === "plain" ? "primary" : "suppress"}>Plain</Btn>
              <Btn onClick={() => setView("raw")} variant={view === "raw" ? "primary" : "suppress"}>Raw</Btn>
            </div>
            <p className="mb-2 text-xs text-zinc-400">subject: {r.subject}</p>
            {view === "letter" && (
              <iframe
                sandbox=""
                srcDoc={r.html}
                className="h-[420px] w-full border border-hairline bg-white"
                title="letter"
              />
            )}
            {view === "plain" && (
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border border-hairline p-3 text-xs text-zinc-300">
                {r.text || "(no plain part)"}
              </pre>
            )}
            {view === "raw" && (
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border border-hairline p-3 text-xs text-zinc-500">
                {r.html}
              </pre>
            )}
          </>
        )}
        {msg && !r && (
          <p className="text-xs text-zinc-600">
            letter wasn't stored for this one (skipped/queued or sent before letter tracking).
          </p>
        )}
      </Card>
    </div>
  );
}

export function LogFeed({ events }: { events: any[] }) {
  const [open, setOpen] = useState<any | null>(null);
  return (
    <>
      <div className="border border-hairline-strong font-mono text-xs">
        {events.map((e: any) => (
          <div
            key={e.id}
            onClick={() => setOpen(e)}
            className="cursor-pointer border-b border-hairline px-2 py-1.5 last:border-b-0 hover:bg-compartment"
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-zinc-600">
                {e.at ? new Date(e.at).toLocaleString("en-GB") : "—"}
              </span>
              <span className={`font-bold uppercase ${LOG_COLOR[e.status] ?? "text-zinc-400"}`}>
                {e.status}
              </span>
              <span className="break-all text-zinc-200">{e.email}</span>
              {e.campaignName && e.campaignName !== "-" && (
                <span className="text-zinc-500">{e.campaignName}</span>
              )}
              {e.meta?.messageId && <span className="ml-auto text-zinc-700">→</span>}
            </div>
            {e.detail && (
              <div className="pl-6 text-[11px] text-zinc-400">{e.detail}</div>
            )}
          </div>
        ))}
        {!events.length && (
          <div className="px-3 py-6 text-center text-zinc-600">
            nothing yet — entries appear as emails go out
          </div>
        )}
      </div>
      {open && <LogDetail event={open} onClose={() => setOpen(null)} />}
    </>
  );
}
