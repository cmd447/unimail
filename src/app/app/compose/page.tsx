"use client";

import { useEffect, useRef, useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Btn, Card, Inp, Note, PageHead, Sel } from "@/components/web/ui";

import { htmlToText } from "@/lib/render";

const TAGS = ["first_name", "last_name", "name", "email", "unsubscribe_url"];

export default function Compose() {
  const { data: pData } = useFetch<{ profiles: any[] }>("/api/profiles");
  const [draft, setDraft] = useState({ subject: "", html: "", text: "" });
  const [tab, setTab] = useState<"edit" | "preview" | "text">("edit");
  const [to, setTo] = useState("");
  const [rcpt, setRcpt] = useState({ firstName: "", lastName: "" });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [probes, setProbes] = useState<any[]>([]);
  const [senderId, setSenderId] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // remember the picked sender — explicit choice, not auto-default
  useEffect(() => {
    const saved = localStorage.getItem("unimail_sender");
    if (saved) setSenderId(saved);
  }, []);
  const pick = (id: string) => {
    setSenderId(id);
    localStorage.setItem("unimail_sender", id);
  };
  const active = pData?.profiles.find((p) => p.id === senderId);
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

  const probeFire = async () => {
    if (!active || !draft.subject || !draft.html) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await api("/api/probe", {
        method: "POST",
        body: JSON.stringify({ profileId: active.id, ...draft }),
      });
      setMsg(
        d.ok
          ? { text: `probe sent to ${d.seed} — check placement in ~60s`, ok: true }
          : { text: d.error ?? "probe failed", ok: false },
      );
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "probe failed", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const probeCheck = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api("/api/probe");
      setProbes(d.probes ?? []);
      if (d.error) setMsg({ text: d.error, ok: false });
      else if (!d.configured)
        setMsg({ text: "seed imap not set — settings → seed inbox", ok: false });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "scan failed", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const sendOne = async () => {
    if (!active || !to || !draft.subject) return;
    const isPlain = tab === "text";
    if (isPlain && !draft.text) return;
    if (!isPlain && !draft.html) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await api("/api/send-test", {
        method: "POST",
        body: JSON.stringify({
          profileId: active.id,
          to,
          ...rcpt,
          subject: draft.subject,
          plainOnly: isPlain,
          ...(isPlain
            ? { text: draft.text }
            : { html: draft.html }), // text derived server-side from html
        }),
      });
      setMsg(
        d.ok
          ? { text: `sent ${d.mode === "plain" ? "plain-text" : "html"} to ${to} — ${d.response ?? "accepted"}`, ok: true }
          : { text: `failed: ${d.error}`, ok: false },
      );
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Compose" sub="send one email to one person — paste your html or type plain text" />

      <Note msg={msg} />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <Card className="mb-4">
            <Inp
              label="Subject"
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              placeholder="subject — {{first_name}} = their name"
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
                  {t === "text" ? "plain" : t === "edit" ? "html" : t}
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
                placeholder="paste your html here…"
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
                placeholder="type or paste your plain-text message…"
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              per-contact swaps
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
              every contact gets their own version — any csv field works: {`{{company}}`}, {`{{city}}`}, whatever's in the list
            </p>
          </Card>

          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              send it
            </h3>
            <Sel
              label="via sender"
              className="mb-2"
              value={senderId}
              onChange={(e) => pick(e.target.value)}
            >
              <option value="">— pick a sender —</option>
              {pData?.profiles.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.fromEmail})
                </option>
              ))}
            </Sel>
            <div className="space-y-2">
              <input
                type="email"
                inputMode="email"
                placeholder="them@their-mail.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border border-zinc-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              />
              <div className="flex gap-2">
                <input
                  placeholder="first name"
                  value={rcpt.firstName}
                  onChange={(e) => setRcpt({ ...rcpt, firstName: e.target.value })}
                  className="min-w-0 flex-1 border border-zinc-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
                />
                <input
                  placeholder="last name"
                  value={rcpt.lastName}
                  onChange={(e) => setRcpt({ ...rcpt, lastName: e.target.value })}
                  className="min-w-0 flex-1 border border-zinc-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
                />
              </div>
              <p className="text-[11px] text-zinc-600">
                names feed {"{{first_name}}"} / {"{{name}}"} — blank = guessed from the email
              </p>
              <p className="text-[11px] text-zinc-500">
                {tab === "text"
                  ? "mode: plain text only — no html part"
                  : "mode: html + text fallback"}
              </p>
              <Btn
                variant="primary"
                onClick={sendOne}
                disabled={busy || !to || !active || !draft.subject || (tab === "text" ? !draft.text : !draft.html)}
              >
                [ send ]
              </Btn>
            </div>
          </Card>

          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              spam placement
            </h3>
            <div className="flex gap-2">
              <Btn onClick={probeFire} disabled={busy || !active || !draft.html}>
                [ test placement ]
              </Btn>
              <Btn onClick={probeCheck} disabled={busy}>[ check ]</Btn>
            </div>
            {probes.slice(0, 3).map((p: any) => (
              <div key={p.id} className="mt-2 border-l-2 pl-2 text-[11px]"
                style={{
                  borderColor:
                    p.placement === "inbox"
                      ? "#34d399"
                      : p.placement === "spam"
                        ? "#f87171"
                        : "#52525b",
                }}
              >
                <div className="text-zinc-400">
                  {p.placement === "inbox"
                    ? "✓ inbox"
                    : p.placement === "spam"
                      ? `✗ spam (${p.folder ?? "?"})`
                      : "… still in transit"}
                </div>
                {p.auth && (
                  <div className="text-zinc-600">
                    {[
                      p.auth.spf && `spf=${p.auth.spf}`,
                      p.auth.dkim &&
                        `dkim=${p.auth.dkim}${p.auth.dkimDomain ? `(${p.auth.dkimDomain})` : ""}`,
                      p.auth.dmarc && `dmarc=${p.auth.dmarc}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </Card>

          <Card>
            <h3 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              save as letter
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
                  setMsg({ text: `saved letter '${name}'`, ok: true });
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
