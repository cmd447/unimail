"use client";

import { useRef, useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Btn, Card, Err, Inp, PageHead, Sel } from "@/components/web/ui";

import { htmlToText } from "@/lib/render";

const TAGS = ["first_name", "last_name", "name", "email", "unsubscribe_url"];

export default function Compose() {
  const { data: tData } = useFetch<{ templates: any[] }>("/api/templates");
  const { data: pData } = useFetch<{ profiles: any[] }>("/api/profiles");
  const [draft, setDraft] = useState({ subject: "", html: "", text: "" });
  const [tab, setTab] = useState<"edit" | "preview" | "text">("edit");
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const active = pData?.profiles.find((p) => p.isActive) ??
    pData?.profiles.find((p) => p.isDefault);
  const insertTag = (t: string) => {
    const el = areaRef.current;
    const tag = `{{${t}}}`;
    if (!el || tab !== "edit") {
      setDraft((d) => ({ ...d, html: d.html + tag }));
      return;
    }
    const { selectionStart: s, selectionEnd: e } = el;
    setDraft((d) => ({ ...d, html: d.html.slice(0, s) + tag + d.html.slice(e) }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + tag.length, s + tag.length);
    });
  };

  const sendTest = async () => {
    if (!active || !testTo) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await api("/api/send-test", {
        method: "POST",
        body: JSON.stringify({ profileId: active.id, to: testTo, ...draft }),
      });
      setMsg(d.ok ? `sent — ${d.response ?? "OK"}` : `failed: ${d.error}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Write" sub="cook up a letter — it personalizes per lead">
        <Sel
          value=""
          className="w-48"
          onChange={(e) => {
            const t = tData?.templates.find((x: any) => x.id === e.target.value);
            if (t) setDraft({ subject: t.subject, html: t.html, text: t.text });
          }}
        >
          <option value="">load letter…</option>
          {tData?.templates.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Sel>
      </PageHead>

      <Err msg={msg} />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <Card className="mb-4">
            <Inp
              label="Subject"
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              placeholder="subject — {{first_name}} swaps per lead"
            />
            <div className="mt-3 flex gap-1 border-b border-zinc-800 pb-2">
              {(["edit", "preview", "text"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-2.5 py-1 text-xs capitalize ${
                    tab === t ? "bg-zinc-800 text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  {t === "text" ? "plain" : t === "edit" ? "letter (html)" : t}
                </button>
              ))}
            </div>
            {tab === "edit" && (
              <textarea
                ref={areaRef}
                value={draft.html}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    html: e.target.value,
                    text: d.text || htmlToText(e.target.value),
                  }))
                }
                rows={16}
                spellCheck={false}
                className="mt-3 w-full border border-zinc-700 bg-black p-3 font-mono text-[13px] text-zinc-300 outline-none focus:border-zinc-500"
                placeholder="<html>…"
              />
            )}
            {tab === "preview" && (
              <div
                className="mt-3 min-h-64 bg-white p-4 text-black"
                dangerouslySetInnerHTML={{ __html: draft.html }}
              />
            )}
            {tab === "text" && (
              <textarea
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                rows={16}
                spellCheck={false}
                className="mt-3 w-full border border-zinc-700 bg-black p-3 font-mono text-[13px] text-zinc-300 outline-none focus:border-zinc-500"
                placeholder="plain-text fallback…"
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              per-lead swaps
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => insertTag(t)}
                  className="border border-zinc-700 px-2 py-0.5 font-mono text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  {`{{${t}}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              every lead gets their own version — any csv field works: {`{{company}}`}, {`{{city}}`}, whatever's in the pack
            </p>
          </Card>

          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              test blast
            </h3>
            <p className="mb-2 text-xs text-zinc-600">
              via {active ? `${active.name} (${active.fromEmail})` : "no sender live"}
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                inputMode="email"
                placeholder="you@test.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="min-w-0 flex-1 border border-zinc-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              />
              <Btn variant="primary" onClick={sendTest} disabled={busy || !testTo || !active}>
                send
              </Btn>
            </div>
          </Card>

          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              stash as letter
            </h3>
            <div className="flex gap-2">
              <input
                id="tpl-name"
                placeholder="letter name"
                className="min-w-0 flex-1 border border-zinc-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              />
              <Btn
                onClick={async () => {
                  const name = (document.getElementById("tpl-name") as HTMLInputElement).value;
                  if (!name) return;
                  await api("/api/templates", {
                    method: "POST",
                    body: JSON.stringify({ name, ...draft, text: draft.text || htmlToText(draft.html) }),
                  });
                  setMsg(`stashed letter '${name}'`);
                }}
              >
                save
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
