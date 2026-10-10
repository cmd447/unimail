"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { api } from "@/components/web/api";
import { Btn, Err } from "@/components/web/ui";
import { parsePaste, rowsFromCsv, type LeadRow } from "@/lib/parseleads";

export async function importRows(
  listId: string,
  rows: LeadRow[],
  onProgress: (msg: string) => void,
) {
  let added = 0, skipped = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += 400) {
    onProgress(`bagging contacts ${i}–${Math.min(i + 400, rows.length)} of ${rows.length}…`);
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

export function ImportLeads({
  listId,
  onDone,
}: {
  listId: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (rows: LeadRow[]) => {
    if (!rows.length) return setMsg("no valid emails found in that");
    setMsg(null);
    try {
      const r = await importRows(listId, rows, setBusy);
      setMsg(`${r.added} contacts bagged · ${r.skipped} dupes yeeted · ${r.invalid} failed`);
      setPaste("");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "import failed");
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>(
      (res, rej) => Papa.parse(f, { header: true, skipEmptyLines: true, complete: res, error: rej }),
    );
    run(rowsFromCsv(parsed));
  };

  return (
    <div className="space-y-3">
      <Err msg={msg} />
      {busy && <p className="text-sm text-zinc-400">{busy}</p>}
      <div className="flex gap-2">
        <Btn variant="primary" onClick={() => fileRef.current?.click()}>
          [ upload csv ]
        </Btn>
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
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          or paste — one per line: email, first, last
        </label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={"jane@x.com, Jane, Doe\nboss@corp.io\nmarketing@gmail.com, Marcus"}
          className="w-full border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-300 placeholder:text-zinc-700 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <Btn variant="primary" disabled={!paste.trim()} onClick={() => run(parsePaste(paste))}>
        [ import ]
      </Btn>
    </div>
  );
}
