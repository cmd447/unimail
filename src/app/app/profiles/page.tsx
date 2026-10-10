"use client";

import { useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Badge, Btn, Card, Inp, Note, PageHead, Sel, Tbl } from "@/components/web/ui";

const EMPTY = {
  name: "", host: "", port: 587, encryption: "starttls", user: "",
  password: "", fromName: "", fromEmail: "", replyTo: "",
  rateLimit: 60, imapHost: "", imapPort: 993,
};

export default function Profiles() {
  const { data, reload } = useFetch<{ profiles: any[] }>("/api/profiles");
  const [editing, setEditing] = useState<any | null>(null); // {} for new
  const [form, setForm] = useState<any>(EMPTY);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = { ...form, port: Number(form.port), rateLimit: Number(form.rateLimit), imapPort: Number(form.imapPort) || undefined };
      if (!body.password) delete body.password;
      if (editing?.id) {
        await api(`/api/profiles/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/profiles", { method: "POST", body: JSON.stringify(body) });
      }
      setEditing(null);
      reload();
      setMsg({ text: "sender saved.", ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<any>) => {
    setMsg(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    }
  };

  return (
    <div>
      <PageHead title="SMTP" sub="the accounts emails go out through — add one, hit verify">
        <Btn
          variant="primary"
          onClick={() => {
            setForm(EMPTY);
            setEditing({});
          }}
        >
          + add a sender
        </Btn>
      </PageHead>

      <Note msg={msg} />

      {editing !== null && (
        <Card className="my-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">
            {editing.id ? `editing ${editing.name}` : "new sender"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Inp label="sender name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <Inp label="smtp host" inputMode="url" value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" />
            <Sel label="encryption" value={form.encryption} onChange={(e) => set("encryption", e.target.value)}>
              <option value="ssl">SSL (465)</option>
              <option value="starttls">STARTTLS (587)</option>
              <option value="none">None (25)</option>
            </Sel>
            <Inp label="Port" inputMode="numeric" value={form.port} onChange={(e) => set("port", e.target.value)} />
            <Inp label="smtp username (usually your email)" inputMode="email" autoComplete="off" value={form.user} onChange={(e) => set("user", e.target.value)} placeholder="you@gmail.com" />
            <Inp label={editing.id ? "password (blank = keep)" : "app password — gmail needs one, not your real password"} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
            <Inp label="from name (what contacts see)" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} />
            <Inp label="from email" type="email" inputMode="email" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} />
            <Inp label="reply-to (optional)" type="email" inputMode="email" value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
            <Inp label="send speed (emails/min)" inputMode="numeric" value={form.rateLimit} onChange={(e) => set("rateLimit", e.target.value)} />
            <Inp label="imap host — catches bounces (optional)" inputMode="url" value={form.imapHost} onChange={(e) => set("imapHost", e.target.value)} />
            <Inp label="imap port" inputMode="numeric" value={form.imapPort} onChange={(e) => set("imapPort", e.target.value)} />
          </div>
          <div className="mt-4 flex gap-2">
            <Btn variant="primary" onClick={save} disabled={busy}>
              {busy ? "saving…" : "save"}
            </Btn>
            <Btn onClick={() => setEditing(null)}>cancel</Btn>
          </div>
        </Card>
      )}

      <Tbl head={["Sender", "Server", "From", "Status", ""]}>
        {(data?.profiles ?? []).map((p) => (
          <tr key={p.id} className="text-zinc-300">
            <td className="px-3 py-2 font-medium">
              {p.name}
              {p.isDefault && <Badge color="blue"> default</Badge>}
              {p.isActive && <Badge color="green"> active</Badge>}
            </td>
            <td className="px-3 py-2 text-zinc-500">
              {p.host}:{p.port} · {p.encryption}
            </td>
            <td className="px-3 py-2 text-zinc-500">{p.fromEmail}</td>
            <td className="px-3 py-2">
              {p.lastError ? (
                <Badge color="red">{p.lastError.slice(0, 40)}</Badge>
              ) : p.lastVerifiedAt ? (
                <Badge color="green">verified</Badge>
              ) : (
                <Badge>unverified</Badge>
              )}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap justify-end gap-1.5">
                <Btn onClick={() => act(() => api("/api/profiles/select", { method: "POST", body: JSON.stringify({ id: p.id }) }))}>
                  use
                </Btn>
                <Btn
                  onClick={() =>
                    act(async () => {
                      const v = await api(`/api/profiles/${p.id}/verify`, { method: "POST" });
                      setMsg(
                        v.ok
                          ? { text: `${p.name}: verified — connection and login work`, ok: true }
                          : { text: `${p.name}: ${v.error}`, ok: false },
                      );
                    })
                  }
                >
                  verify
                </Btn>
                {!p.isDefault && (
                  <Btn onClick={() => act(() => api(`/api/profiles/${p.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }))}>
                    set default
                  </Btn>
                )}
                <Btn
                  onClick={() => {
                    setForm({ ...EMPTY, ...p, password: "" });
                    setEditing(p);
                  }}
                >
                  edit
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => {
                    if (confirm(`delete '${p.name}'?`))
                      act(() => api(`/api/profiles/${p.id}`, { method: "DELETE" }));
                  }}
                >
                  delete
                </Btn>
              </div>
            </td>
          </tr>
        ))}
        {!data?.profiles?.length && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">
              no senders — hook one up
            </td>
          </tr>
        )}
      </Tbl>
    </div>
  );
}
