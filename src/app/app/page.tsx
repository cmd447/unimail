"use client";

import Link from "next/link";
import { useFetch } from "@/components/web/api";
import { Badge, Card, PageHead, statusColor } from "@/components/web/ui";

export default function Overview() {
  const profiles = useFetch<{ profiles: any[] }>("/api/profiles");
  const lists = useFetch<{ lists: any[] }>("/api/lists");
  const templates = useFetch<{ templates: any[] }>("/api/templates");
  const campaigns = useFetch<{ campaigns: any[] }>("/api/campaigns");
  const events = useFetch<{ events: any[] }>("/api/events?limit=8");
  const settings = useFetch<{ settings: any }>("/api/settings");

  const active = profiles.data?.profiles.find((p) => p.isActive);
  const contacts = lists.data?.lists.reduce((s, l) => s + (l.count || 0), 0) ?? 0;

  const stats = [
    ["Senders", profiles.data?.profiles.length ?? "—"],
    ["Letters", templates.data?.templates.length ?? "—"],
    ["Leads", contacts],
    ["Blasts", campaigns.data?.campaigns.length ?? "—"],
  ];

  return (
    <div>
      <PageHead title="HQ" sub="the hub — everything at a glance" />

      {settings.data?.settings.killSwitch ? (
        <Card className="mb-4 border-red-900/60 bg-red-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-400">
              KILL SWITCH ON — all blasts frozen
            </span>
            <Link href="/app/settings" className="text-xs text-red-300 underline">
              fix it →
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, v]) => (
          <Card key={label}>
            <div className="text-2xl font-semibold text-zinc-300">{v}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">live sender</h2>
            <Link href="/app/profiles" className="text-xs text-zinc-500 hover:text-zinc-300">
              rigs →
            </Link>
          </div>
          {active ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-zinc-300">
                {active.name}
                {active.isDefault && (
                  <Badge color="blue"> default</Badge>
                )}
              </div>
              <div className="text-zinc-500">
                {active.host}:{active.port} · {active.encryption}
              </div>
              <div className="text-zinc-500">from: {active.fromEmail}</div>
              <div>
                {active.lastError ? (
                  <Badge color="red">error: {active.lastError.slice(0, 50)}</Badge>
                ) : active.lastVerifiedAt ? (
                  <Badge color="green">verified</Badge>
                ) : (
                  <Badge>unverified</Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              no sender live —{" "}
              <Link href="/app/profiles" className="underline">
                pick one
              </Link>
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium text-zinc-300">latest receipts</h2>
          <div className="space-y-1.5">
            {(events.data?.events ?? []).map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Badge color={statusColor(e.status)}>{e.status}</Badge>
                <span className="truncate text-zinc-400">{e.email}</span>
                <span className="ml-auto shrink-0 text-zinc-600">
                  {e.at ? new Date(e.at).toLocaleTimeString() : ""}
                </span>
              </div>
            ))}
            {!events.data?.events?.length && (
              <p className="text-xs text-zinc-600">quiet so far</p>
            )}
          </div>
        </Card>
      </div>

      {campaigns.data?.campaigns?.filter((c) =>
        ["sending", "paused", "scheduled"].includes(c.status),
      ).length ? (
        <Card className="mt-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">blasting rn</h2>
          {campaigns.data.campaigns
            .filter((c) => ["sending", "paused", "scheduled"].includes(c.status))
            .map((c) => (
              <Link
                key={c.id}
                href={`/app/campaigns/${c.id}`}
                className="mb-2 block border border-zinc-800 p-3 hover:bg-black/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-300">{c.name}</span>
                  <Badge color={statusColor(c.status)}>{c.status}</Badge>
                  <span className="ml-auto text-xs text-zinc-500">
                    {c.counters.sent + c.counters.failed + c.counters.skipped}/
                    {c.counters.total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-zinc-800">
                  <div
                    className="h-full bg-zinc-400 transition-all"
                    style={{
                      width: `${
                        (100 *
                          (c.counters.sent + c.counters.failed + c.counters.skipped)) /
                        Math.max(1, c.counters.total)
                      }%`,
                    }}
                  />
                </div>
              </Link>
            ))}
        </Card>
      ) : null}
    </div>
  );
}
