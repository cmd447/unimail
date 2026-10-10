"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/web/api";
import { ImportLeads } from "@/components/web/importleads";
import { Badge, Btn, Card, Err, Inp, PageHead, Tbl } from "@/components/web/ui";

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const [contacts, setContacts] = useState<any[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [list, setList] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ email: "", firstName: "", lastName: "" });
  const [importing, setImporting] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

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

  const addContact = async () => {
    if (!nc.email) return;
    setMsg(null);
    try {
      await api("/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ listId: id, rows: [nc] }),
      });
      setNc({ email: "", firstName: "", lastName: "" });
      setAdding(false);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div>
      <PageHead
        title={list?.name ?? "List"}
        sub={`${list?.count ?? contacts.length} contacts`}
      >
        <Link href="/app/lists" className="self-center text-sm text-zinc-500 hover:text-zinc-300">
          ← lists
        </Link>
        <Btn onClick={() => setAdding(!adding)}>+ add contact</Btn>
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
              setMsg(`checked ${d.checked} nameless contacts — ${d.resolved} real names found${src ? ` (${src})` : ""}`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Failed");
            } finally {
              setImporting(null);
            }
            reload();
          }}
        >
          resolve names
        </Btn>
        <Btn variant="primary" onClick={() => setShowImport(!showImport)}>
          [ import ]
        </Btn>
      </PageHead>

      {importing && (
        <Card className="mb-3"><p className="text-sm text-zinc-400">{importing}</p></Card>
      )}
      <Err msg={msg} />

      {showImport && (
        <Card className="mb-4">
          <ImportLeads listId={id} onDone={reload} />
        </Card>
      )}

      {adding && (
        <Card className="my-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <Inp label="contact email" type="email" inputMode="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
            <Inp label="first name (for {{first_name}})" value={nc.firstName} onChange={(e) => setNc({ ...nc, firstName: e.target.value })} />
            <Inp label="last name" value={nc.lastName} onChange={(e) => setNc({ ...nc, lastName: e.target.value })} />
            <Btn variant="primary" onClick={addContact}>add</Btn>
          </div>
        </Card>
      )}

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
