"use client";

import { useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Area, Btn, Card, Err, Inp, PageHead } from "@/components/web/ui";
import { SpamRadar } from "@/components/web/spamradar";
import { htmlToText } from "@/lib/render";

export default function Letters() {
  const { data, reload } = useFetch<{ templates: any[] }>("/api/templates");
  const [sel, setSel] = useState<any | null>(null); // {id?} editing, null = closed
  const [form, setForm] = useState({ name: "", subject: "", html: "", text: "" });
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const open = (t?: any) => {
    setSel(t ?? {});
    setForm(t ? { name: t.name, subject: t.subject, html: t.html, text: t.text } : { name: "", subject: "", html: "", text: "" });
    setPreview(false);
  };

  const save = async () => {
    setMsg(null);
    try {
      const body = { ...form, text: form.text || htmlToText(form.html) };
      if (sel?.id) {
        await api(`/api/templates/${sel.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/templates", { method: "POST", body: JSON.stringify(body) });
      }
      setSel(null);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div>
      <PageHead title="Letters" sub="reusable emails — {{first_name}} and friends personalize per contact">
        <Btn variant="primary" onClick={() => open()}>+ write a letter</Btn>
      </PageHead>
      <Err msg={msg} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {(data?.templates ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => open(t)}
              className={`block w-full border p-3 text-left ${
                sel?.id === t.id
                  ? "border-zinc-500 bg-zinc-800/60"
                  : "border-zinc-800 bg-[#16181d] hover:border-zinc-700"
              }`}
            >
              <div className="text-sm font-medium text-zinc-300">{t.name}</div>
              <div className="truncate text-xs text-zinc-500">{t.subject}</div>
            </button>
          ))}
          {!data?.templates?.length && (
            <p className="px-1 py-4 text-sm text-zinc-600">no letters — write one</p>
          )}
        </div>

        {sel !== null && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-300">
                {sel.id ? `editing: ${sel.name}` : "new letter"}
              </h2>
              <div className="flex gap-1.5">
                <Btn onClick={() => setPreview(!preview)}>
                  {preview ? "edit" : "preview"}
                </Btn>
                {sel.id && (
                  <Btn
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(`delete '${sel.name}'?`)) return;
                      await api(`/api/templates/${sel.id}`, { method: "DELETE" });
                      setSel(null);
                      reload();
                    }}
                  >
                    delete
                  </Btn>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Inp label="letter name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Inp label="subject line" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="mt-3">
              {preview ? (
                <div
                  className="min-h-64 bg-white p-4 text-black"
                  dangerouslySetInnerHTML={{ __html: form.html }}
                />
              ) : (
                <Area
                  label="the letter (html)"
                  rows={14}
                  spellCheck={false}
                  value={form.html}
                  onChange={(e) => setForm({ ...form, html: e.target.value })}
                />
              )}
            </div>
            {!preview && (
              <div className="mt-3">
                <Area
                  label="plain version (blank = auto-makes it)"
                  rows={4}
                  spellCheck={false}
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                />
              </div>
            )}
            <div className="mt-3">
              <SpamRadar
                subject={form.subject}
                html={form.html}
                text={form.text}
                onApply={(d) => setForm((f) => ({ ...f, ...d }))}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Btn variant="primary" onClick={save}>Save</Btn>
              <Btn onClick={() => setSel(null)}>Close</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
