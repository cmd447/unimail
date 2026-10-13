"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/web/api";
import { ImportLeads } from "@/components/web/importleads";
import { Badge, Btn, Card, Note, PageHead, Tbl } from "@/components/web/ui";

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const [contacts, setContacts] = useState<any[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [list, setList] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    const d = await api(`/api/contacts?listId=${id}&limit=100${after ? `&after=${after}` : ""}`);
    setContacts((c) => (after ? [...c, ...d.contacts] : d.contacts));
    setNext(d.next);
  }, [id]);

  const reload = () => {
    setContacts([]);
    load();
    api("/api/lists").then((d) => setList(d.lists.find((l: any) => l.id === id)));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div>
      <PageHead
        title={list?.name ?? "List"}
        sub={`${list?.count ?? contacts.length} contacts`}
      >
        <Link href="/app/lists" className="self-center text-sm text-zinc-500 hover:text-zinc-300">
          ← lists
        </Link>
        <Btn
          onClick={async () => {
            setImporting("resolving real names…");
            try {
              const d = await api("/api/leads/enrich", {
                method: "POST",
                body: JSON.stringify({ listId: id }),
              });
              const src = Object.entries(d.bySource ?? {})
                .map(([k, v]) => `${v} via ${k}`)
                .join(", ");
              setMsg({
                text: `checked ${d.checked} nameless contacts — ${d.resolved} real names found${src ? ` (${src})` : ""}`,
                ok: true,
              });
            } catch (e) {
              setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
            } finally {
              setImporting(null);
            }
            reload();
          }}
        >
          resolve names
        </Btn>
      </PageHead>

      {importing && (
        <Card className="mb-3"><p className="text-sm text-zinc-400">{importing}</p></Card>
      )}
      <Note msg={msg} />

      <Card className="mb-4">
        <ImportLeads listId={id} onDone={reload} />
      </Card>

      <Tbl head={["Contact", "Name", "Status", ""]}>
        {contacts.map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2 text-zinc-300">{c.email}</td>
            <td className="px-3 py-2 text-zinc-400">
              {[c.firstName, c.lastName].filter(Boolean).join(" ")}
            </td>
            <td className="px-3 py-2">
              <Badge color={c.status === "active" ? "green" : "amber"}>{c.status}</Badge>
            </td>
            <td className="px-3 py-2 text-right">
              <Btn
                variant="danger"
                onClick={async () => {
                  await api(`/api/contacts/${c.id}`, { method: "DELETE" });
                  reload();
                }}
              >
                delete
              </Btn>
            </td>
          </tr>
        ))}
        {!contacts.length && (
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-zinc-600">
              empty list — import a csv or add contacts
            </td>
          </tr>
        )}
      </Tbl>
      {next && (
        <div className="mt-3 text-center">
          <Btn onClick={() => load(next)}>load more</Btn>
        </div>
      )}
    </div>
  );
}
