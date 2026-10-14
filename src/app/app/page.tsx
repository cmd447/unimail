"use client";

import Link from "next/link";
import { useFetch } from "@/components/web/api";
import { Badge, Card, PageHead, statusColor } from "@/components/web/ui";

export default function Overview() {
  const profiles = useFetch<{ profiles: any[] }>("/api/profiles");
  const lists = useFetch<{ lists: any[] }>("/api/lists");
  const letters = useFetch<{ templates: any[] }>("/api/templates");
  const blast = useFetch<{ campaigns: any[] }>("/api/campaigns");
  const events = useFetch<{ events: any[] }>("/api/events?limit=8");
  const settings = useFetch<{ settings: any }>("/api/settings");

  const senders = profiles.data?.profiles ?? [];
  const contacts = lists.data?.lists.reduce((s, l) => s + (l.count || 0), 0) ?? 0;

  const steps = [
    {
      n: "1",
      label: "add a sender",
      why: "the smtp account emails go out through",
      done: (profiles.data?.profiles.length ?? 0) > 0,
      href: "/app/profiles",
    },
    {
      n: "2",
      label: "add contacts",
      why: `${contacts || "no"} loaded — paste or csv`,
      done: contacts > 0,
      href: "/app/lists",
    },
    {
      n: "3",
      label: "write a letter",
      why: "one email — {{first_name}} personalizes it per contact",
      done: (letters.data?.templates.length ?? 0) > 0,
      href: "/app/templates",
    },
    {
      n: "4",
      label: "send a blast",
      why: "pick the three above, hit send",
      done: (blast.data?.campaigns.length ?? 0) > 0,
      href: "/app/campaigns/new",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <PageHead title="Home" sub="what's set up and what's going out" />

      {settings.data?.settings.killSwitch ? (
        <Card className="mb-4 border-red-900/60 bg-red-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-400">
              kill switch on — all sends paused
            </span>
            <Link href="/app/settings" className="text-xs text-red-300 underline">
              fix it →
            </Link>
          </div>
        </Card>
      ) : null}

      <Card className="mb-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-300">getting started</h2>
          <span className="text-xs text-zinc-500">{doneCount}/4 done</span>
        </div>
        {steps.map((s) => (
          <Link
            key={s.n}
            href={s.href}
            className="flex items-baseline gap-3 border-t border-zinc-800 py-2.5 hover:bg-zinc-900/40"
          >
            <span
              className={`w-14 shrink-0 text-[11px] uppercase ${
                s.done ? "text-green-500" : "text-zinc-600"
              }`}
            >
              {s.done ? "done" : `step ${s.n}`}
            </span>
            <span className={s.done ? "text-zinc-400" : "font-medium text-zinc-200"}>
              {s.label}
            </span>
            <span className="ml-auto text-[11px] text-zinc-600">{s.why}</span>
          </Link>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">senders</h2>
            <Link href="/app/profiles" className="text-xs text-zinc-500 hover:text-zinc-300">
              all senders →
            </Link>
          </div>
          {senders.length ? (
            <div className="space-y-2 text-sm">
              {senders.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-zinc-300">{p.name}</span>
                    <span className="ml-2 text-xs text-zinc-500">{p.fromEmail}</span>
                  </div>
                  {p.lastError ? (
                    <Badge color="red">error</Badge>
                  ) : p.lastVerifiedAt ? (
                    <Badge color="green">verified</Badge>
                  ) : (
                    <Badge>unverified</Badge>
                  )}
                </div>
              ))}
              {senders.length > 4 && (
                <div className="text-xs text-zinc-600">+{senders.length - 4} more</div>
              )}
              <p className="text-xs text-zinc-600">pick which sender when you compose or blast</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              none yet —{" "}
              <Link href="/app/profiles" className="underline">
                add a sender
              </Link>
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium text-zinc-300">recent activity</h2>
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
              <p className="text-xs text-zinc-600">nothing yet</p>
            )}
          </div>
        </Card>
      </div>

      {blast.data?.campaigns?.filter((c) =>
        ["sending", "paused", "scheduled"].includes(c.status),
      ).length ? (
        <Card className="mt-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">in progress</h2>
          {blast.data.campaigns
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
