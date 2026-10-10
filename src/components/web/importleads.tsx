"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { api } from "@/components/web/api";
import { Btn, Err, Inp } from "@/components/web/ui";
import { parsePaste, rowsFromCsv, type LeadRow } from "@/lib/parseleads";

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

export function ImportLeads({
  listId,
  onDone,
}: {
  listId: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [one, setOne] = useState({ email: "", firstName: "", lastName: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (rows: LeadRow[]) => {
    if (!rows.length) return setMsg("no valid emails found in that");
    setMsg(null);
    try {
      const r = await importRows(listId, rows, setBusy);
      setMsg(`${r.added} added · ${r.skipped} already in · ${r.invalid} invalid`);
      setPaste("");
      setOne({ email: "", firstName: "", lastName: "" });
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "import failed");
    } finally {
      setBusy(null);
    }
  };

  const addOne = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(one.email.trim()))
      return setMsg("that email doesn't look right");
    run([{ email: one.email.trim(), firstName: one.firstName.trim(), lastName: one.lastName.trim(), fields: {} }]);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>(
      (res, rej) => Papa.parse(f, { header: true, skipEmptyLines: true, complete: res, error: rej }),
    );
    run(rowsFromCsv(parsed));
  };

  const parsed = parsePaste(paste);

  return (
    <div className="space-y-3">
      <Err msg={msg} />
      {busy && <p className="text-sm text-zinc-400">{busy}</p>}

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <Inp label="add one" type="email" inputMode="email" placeholder="email" value={one.email}
          onChange={(e) => setOne({ ...one, email: e.target.value })} />
        <Inp label="first name" value={one.firstName}
          onChange={(e) => setOne({ ...one, firstName: e.target.value })} />
        <Inp label="last name" value={one.lastName}
          onChange={(e) => setOne({ ...one, lastName: e.target.value })} />
        <Btn onClick={addOne} disabled={!one.email.trim()}>add</Btn>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          or paste a bunch — commas, spaces, or one per line
        </label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={"worldofhydras@gmail.com,info.9omnitech@gmail.com\njane@x.com, Jane, Doe\nboss@corp.io"}
          className="w-full border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-300 placeholder:text-zinc-700 focus:border-zinc-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <Btn variant="primary" disabled={!paste.trim()} onClick={() => run(parsed)}>
            [ import {parsed.length ? `${parsed.length} ` : ""}]
          </Btn>
          <Btn onClick={() => fileRef.current?.click()}>[ upload csv ]</Btn>
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
      </div>
    </div>
  );
}
