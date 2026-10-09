"use client";

import Link from "next/link";
import { api, useFetch } from "@/components/web/api";
import { Badge, Btn, PageHead, Tbl, statusColor } from "@/components/web/ui";

export default function Campaigns() {
  const { data, reload } = useFetch<{ campaigns: any[] }>("/api/campaigns");

  const act = async (id: string, action: string) => {
    await api(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    reload();
  };

  return (
    <div>
      <PageHead title="Blasts" sub="the send queue">
        <Btn onClick={reload}>refresh</Btn>
        <Link href="/app/campaigns/new">
          <Btn variant="primary">+ new blast</Btn>
        </Link>
      </PageHead>

      <Tbl head={["Blast", "Pack", "State", "Landed", "Dropped", ""]}>
        {(data?.campaigns ?? []).map((c) => {
          const done = c.counters.sent + c.counters.failed + c.counters.skipped;
          const pct = Math.round((100 * done) / Math.max(1, c.counters.total));
          return (
            <tr key={c.id}>
              <td className="px-3 py-2">
                <Link href={`/app/campaigns/${c.id}`} className="font-medium text-zinc-300 hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-zinc-500">{c.listName}</td>
              <td className="px-3 py-2">
                <Badge color={statusColor(c.status)}>{c.status}</Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 bg-zinc-800">
                    <div className="h-full bg-zinc-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {done}/{c.counters.total}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500">
                {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  {["draft", "scheduled", "failed"].includes(c.status) && (
                    <Btn onClick={() => act(c.id, "send")}>blast it</Btn>
                  )}
                  {c.status === "sending" && <Btn onClick={() => act(c.id, "pause")}>hold</Btn>}
                  {c.status === "paused" && <Btn onClick={() => act(c.id, "resume")}>keep going</Btn>}
                  {!["completed", "cancelled"].includes(c.status) && (
                    <Btn
                      variant="danger"
                      onClick={() => confirm(`call off '${c.name}'?`) && act(c.id, "cancel")}
                    >
                      cancel
                    </Btn>
                  )}
                  <Btn
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(`yeet '${c.name}'?`)) return;
                      await api(`/api/campaigns/${c.id}`, { method: "DELETE" });
                      reload();
                    }}
                  >
                    yeet
                  </Btn>
                </div>
              </td>
            </tr>
          );
        })}
        {!data?.campaigns?.length && (
          <tr>
            <td colSpan={6} className="px-3 py-6 text-center text-zinc-600">
              no blasts — go cook one
            </td>
          </tr>
        )}
      </Tbl>
    </div>
  );
}
