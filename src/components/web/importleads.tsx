"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { api, useFetch } from "@/components/web/api";
import { Btn, Inp, Note } from "@/components/web/ui";
import { parsePaste, rowsFromCsv, type LeadRow } from "@/lib/parseleads";
import { nameFromEmail } from "@/lib/render";

export async function importRows(
  listId: string,
  rows: LeadRow[],
  onProgress: (msg: string) => void,
) {
  let added = 0, skipped = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += 400) {
    onProgress(`importing ${i}–${Math.min(i + 400, rows.length)} of ${rows.length}…`);
    const d = await api("/api/contacts/import", {
      method: "POST",
      body: JSON.stringify({ listId, rows: rows.slice(i, i + 400) }),
    });
    added += d.added;
    skipped += d.skipped;
    invalid += d.invalid.length;
  }
  return { added, skipped, invalid };
}

// what the merge engine will actually see — real name or the email guess
const displayName = (r: { email: string; firstName?: string; lastName?: string }) => {
  if (r.firstName || r.lastName) {
    const first = r.firstName ?? "", last = r.lastName ?? "";
    return { first, last, name: [first, last].filter(Boolean).join(" "), guessed: false };
  }
  const g = nameFromEmail(r.email);
  return { ...g, guessed: true };
};

export function ImportLeads({
  listId,
  onDone,
}: {
  listId: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const settings = useFetch<{ settings: any }>("/api/settings");
  const aiOn = Boolean(settings.data?.settings?.aiEnabled);
  const [paste, setPaste] = useState("");
  const [one, setOne] = useState("");
  const [aiRows, setAiRows] = useState<LeadRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [added, setAdded] = useState<LeadRow[] | null>(null);

  // local parse is instant; ai rows (when run) take over the preview
  const localRows = useMemo(() => parsePaste(paste), [paste]);
  const rows = aiRows ?? localRows;

  const run = async (rs: LeadRow[]) => {
    if (!rs.length)
      return setMsg({ text: "no valid emails found in that", ok: false });
    setMsg(null);
    try {
      const r = await importRows(listId, rs, setBusy);
      setMsg({
        text: `${r.added} added · ${r.skipped} already in · ${r.invalid} invalid`,
        ok: true,
      });
      setAdded(r.added || r.skipped ? rs : null);
      setPaste("");
      setOne("");
      setAiRows(null);
      onDone();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "import failed", ok: false });
    } finally {
      setBusy(null);
    }
  };

  const aiSort = async () => {
    if (!paste.trim()) return;
    setBusy("ai is sorting it…");
    setMsg(null);
    try {
      const d = await api("/api/ai/leads", {
        method: "POST",
        body: JSON.stringify({ text: paste }),
      });
      if (!d.ok) throw new Error(d.error);
      setAiRows(d.rows.map((r: any) => ({ ...r, fields: {} })));
      if (!d.rows.length)
        setMsg({ text: "ai found no emails in that", ok: false });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "ai failed", ok: false });
    } finally {
      setBusy(null);
    }
  };

  // the manual field accepts the same messy formats — jane@x.com,
  // "Jane Doe <jane@x.com>", whatever
  const oneParsed = useMemo(() => {
    const r = parsePaste(one)[0];
    return r ?? null;
  }, [one]);

  const addOne = () => {
    if (!oneParsed)
      return setMsg({ text: "that email doesn't look right", ok: false });
    run([{ ...oneParsed, fields: {} }]);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>(
      (res, rej) => Papa.parse(f, { header: true, skipEmptyLines: true, complete: res, error: rej }),
    );
    setAiRows(null);
    run(rowsFromCsv(parsed));
  };

  return (
    <div className="space-y-3">
      <Note msg={msg} />
      {busy && <p className="text-sm text-zinc-400">{busy}</p>}

      <div className="flex items-end gap-2">
        <Inp
          label="add one — 'jane@x.com' or 'Jane Doe <jane@x.com>' both work"
          inputMode="email"
          value={one}
          onChange={(e) => setOne(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addOne()}
          className="flex-1"
        />
        <Btn onClick={addOne} disabled={!oneParsed}>Add</Btn>
      </div>
      {oneParsed && (
        <p className="text-[11px] text-zinc-600 -mt-1">
          → {oneParsed.email}
          {(() => { const n = displayName(oneParsed); return n.name ? ` · ${n.name}${n.guessed ? " (guessed)" : ""}` : ""; })()}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            or paste — any format: names, commas, tables, signatures
          </label>
          <textarea
            value={paste}
            onChange={(e) => { setPaste(e.target.value); setAiRows(null); }}
            rows={8}
            spellCheck={false}
            placeholder={"a@x.com,b@y.com,c@z.com\nJane Doe <jane@x.com>\n\"Smith, Bob\" — bob@corp.io\njane@x.com, Jane, Doe"}
            className="w-full border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-300 placeholder:text-zinc-700 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        {/* sorted-out preview — shows what each line becomes */}
        <div className="border-l border-zinc-800 pl-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              sorted preview
            </span>
            <span className="text-[10px] text-zinc-600">
              {rows.length ? `${rows.length}${aiRows ? " · ai" : ""}` : ""}
            </span>
          </div>
          <div className="space-y-1">
            {rows.slice(0, 12).map((r, i) => {
              const n = displayName(r);
              return (
                <div key={i} className="text-[11px] leading-tight">
                  <div className="truncate text-zinc-300">{r.email}</div>
                  <div className="truncate text-zinc-600">
                    {n.name
                      ? `${n.first} ${n.last}`.trim() + (n.guessed ? " — guessed" : "")
                      : "—"}
                  </div>
                </div>
              );
            })}
            {rows.length > 12 && (
              <div className="text-[11px] text-zinc-600">+{rows.length - 12} more</div>
            )}
            {!rows.length && paste.trim() && (
              <div className="text-[11px] text-zinc-600">
                nothing parsed locally — {aiOn ? "try ai sort" : "check the format"}
              </div>
            )}
            {!paste.trim() && (
              <div className="text-[11px] text-zinc-600">paste to see the sort</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" disabled={!rows.length} onClick={() => run(rows)}>
          Import {rows.length ? `${rows.length}` : ""}
        </Btn>
        {aiOn && (
          <Btn disabled={!paste.trim()} onClick={aiSort}>
            ai sort
          </Btn>
        )}
        <Btn onClick={() => fileRef.current?.click()}>upload csv</Btn>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {added && added.length > 0 && (
        <div className="border-l border-hairline-strong pl-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              just added
            </span>
            <Link
              href={`/app/lists/${listId}`}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              view all →
            </Link>
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {added.slice(0, 30).map((r, i) => {
              const n = displayName(r);
              return (
                <div key={i} className="flex justify-between gap-3 text-[11px] leading-relaxed">
                  <span className="truncate text-zinc-300">{r.email}</span>
                  <span className="truncate text-zinc-600">{n.name}</span>
                </div>
              );
            })}
          </div>
          {added.length > 30 && (
            <div className="mt-1 text-[11px] text-zinc-600">
              +{added.length - 30} more —{" "}
              <Link href={`/app/lists/${listId}`} className="hover:text-zinc-300">
                see the whole list
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
