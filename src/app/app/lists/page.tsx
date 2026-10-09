"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Btn, Card, Err, Inp, PageHead, Sel, Tbl } from "@/components/web/ui";
import { ImportLeads } from "@/components/web/importleads";

export default function Lists() {
  const { data, reload } = useFetch<{ lists: any[] }>("/api/lists");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [packId, setPackId] = useState("");
  const [newPack, setNewPack] = useState("");
  const [form, setForm] = useState({ name: "", description: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const create = async () => {
    if (!form.name.trim()) return;
    await api("/api/lists", { method: "POST", body: JSON.stringify(form) });
    setAdding(false);
    setForm({ name: "", description: "" });
    reload();
  };

  return (
    <div>
      <PageHead title="Leads" sub="lead packs for your blasts">
        <Btn onClick={() => { setImporting(!importing); setAdding(false); }}>[ import leads ]</Btn>
        <Btn variant="primary" onClick={() => { setAdding(!adding); setImporting(false); }}>+ new pack</Btn>
      </PageHead>
      <Err msg={msg} />

      {importing && (
        <Card className="mb-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-300">bag some leads</h3>
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
            <Sel
              label="into pack"
              value={packId}
              onChange={(e) => { setPackId(e.target.value); if (e.target.value) setNewPack(""); }}
            >
              <option value="">— pick a pack —</option>
              {(data?.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.count})</option>
              ))}
            </Sel>
            <Inp
              label="or new pack name"
              value={newPack}
              onChange={(e) => { setNewPack(e.target.value); if (e.target.value) setPackId(""); }}
            />
          </div>
          {packId ? (
            <ImportLeads listId={packId} onDone={reload} />
          ) : newPack.trim() ? (
            <Btn
              variant="primary"
              onClick={async () => {
                try {
                  const d = await api("/api/lists", {
                    method: "POST",
                    body: JSON.stringify({ name: newPack.trim() }),
                  });
                  setPackId(d.list.id);
                  setNewPack("");
                  reload();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              [ create '{newPack.trim()}' first ]
            </Btn>
          ) : (
            <p className="text-xs text-zinc-600">choose a pack to unlock upload/paste</p>
          )}
        </Card>
      )}

      {adding && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Inp label="pack name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Inp label="what's in it" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Btn variant="primary" onClick={create}>create</Btn>
          </div>
        </Card>
      )}

      <Tbl head={["Pack", "Leads", "About", ""]}>
        {(data?.lists ?? []).map((l) => (
          <tr key={l.id}>
            <td className="px-3 py-2">
              <Link href={`/app/lists/${l.id}`} className="font-medium text-zinc-300 hover:underline">
                {l.name}
              </Link>
            </td>
            <td className="px-3 py-2 text-zinc-400">{l.count}</td>
            <td className="px-3 py-2 text-zinc-500">{l.description}</td>
            <td className="px-3 py-2 text-right">
              <Btn
                variant="danger"
                onClick={async () => {
                  if (!confirm(`yeet pack '${l.name}'?`)) return;
                  try {
                    await api(`/api/lists/${l.id}`, { method: "DELETE" });
                    reload();
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Failed");
                  }
                }}
              >
                yeet
              </Btn>
            </td>
          </tr>
        ))}
        {!data?.lists?.length && (
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-zinc-600">
              no packs — make one, then import a csv
            </td>
          </tr>
        )}
      </Tbl>
    </div>
  );
}
