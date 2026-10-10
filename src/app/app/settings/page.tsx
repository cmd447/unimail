"use client";

import { useState } from "react";
import { api, useFetch } from "@/components/web/api";
import { Badge, Btn, Card, Err, Inp, PageHead, Tbl } from "@/components/web/ui";

export default function Settings() {
  const { data, reload } = useFetch<{ settings: any }>("/api/settings");
  const supp = useFetch<{ suppressions: any[] }>("/api/suppressions");
  const [cap, setCap] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [seed, setSeed] = useState({
    email: "", host: "", port: "993", user: "", pass: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const s = data?.settings;

  const run = async (fn: () => Promise<any>) => {
    setMsg(null);
    try {
      await fn();
      reload();
      supp.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHead title="Settings" sub="caps, seed inbox, suppressions" />
      <Err msg={msg} />

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">Kill switch</h2>
            <p className="text-xs text-zinc-500">
              freezes every live campaign at the next batch
            </p>
          </div>
          <Btn
            variant={s?.killSwitch ? "danger" : "suppress"}
            onClick={() =>
              run(() =>
                api("/api/settings", {
                  method: "PATCH",
                  body: JSON.stringify({ killSwitch: !s?.killSwitch }),
                }),
              )
            }
          >
            {s?.killSwitch ? "ON — campaigns frozen" : "off"}
          </Btn>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="text-sm font-medium text-zinc-300">Daily send limit</h2>
        <p className="mb-3 text-xs text-zinc-500">
          max emails per day across everything · 0 = no limit · current:{" "}
          {s?.dailyCap || "unlimited"}
        </p>
        <div className="flex max-w-56 gap-2">
          <Inp
            inputMode="numeric"
            placeholder="0"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
          <Btn
            onClick={() =>
              run(() =>
                api("/api/settings", {
                  method: "PATCH",
                  body: JSON.stringify({ dailyCap: parseInt(cap, 10) || 0 }),
                }),
              )
            }
          >
            set
          </Btn>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="text-sm font-medium text-zinc-300">Seed inbox — spam detection</h2>
        <p className="mb-3 text-xs text-zinc-500">
          a mailbox you own (a gmail works). every campaign sends one copy here,
          then cron checks whether it sent in inbox or spam.
          {s?.seedEmail && (
            <>
              {" "}active: <span className="text-zinc-300">{s.seedEmail}</span>
              {s.seedImapPassSet ? " · imap set" : " · no imap pass"}
            </>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Inp
            label="seed email"
            type="email"
            inputMode="email"
            value={seed.email}
            onChange={(e) => setSeed({ ...seed, email: e.target.value })}
            placeholder={s?.seedEmail || "probe@gmail.com"}
          />
          <Inp
            label="imap host"
            inputMode="url"
            value={seed.host}
            onChange={(e) => setSeed({ ...seed, host: e.target.value })}
            placeholder={s?.seedImapHost || "imap.gmail.com"}
          />
          <Inp
            label="imap port"
            inputMode="numeric"
            value={seed.port}
            onChange={(e) => setSeed({ ...seed, port: e.target.value })}
            placeholder={String(s?.seedImapPort ?? 993)}
          />
          <Inp
            label="imap login"
            inputMode="email"
            autoComplete="off"
            value={seed.user}
            onChange={(e) => setSeed({ ...seed, user: e.target.value })}
            placeholder={s?.seedImapUser || "usually same as the email"}
          />
          <Inp
            label={s?.seedImapPassSet ? "imap pass (blank = keep)" : "imap pass / app password"}
            type="password"
            autoComplete="new-password"
            value={seed.pass}
            onChange={(e) => setSeed({ ...seed, pass: e.target.value })}
          />
        </div>
        <Btn
          variant="primary"
          className="mt-3"
          onClick={() =>
            run(() =>
              api("/api/settings", {
                method: "PATCH",
                body: JSON.stringify({
                  seedEmail: seed.email || undefined,
                  seedImapHost: seed.host || undefined,
                  seedImapPort: parseInt(seed.port, 10) || undefined,
                  seedImapUser: seed.user || undefined,
                  seedImapPass: seed.pass || undefined,
                }),
              }),
            )
          }
        >
          [ save ]
        </Btn>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-medium text-zinc-300">Suppressed</h2>
        <p className="mb-3 text-xs text-zinc-500">
          addresses that unsubscribed or bounced — skipped automatically
        </p>
        <div className="mb-3 flex max-w-md gap-2">
          <Inp
            type="email"
            inputMode="email"
            placeholder="email to suppress"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Btn
            onClick={() => {
              if (!newEmail.trim()) return;
              run(() =>
                api("/api/suppressions", {
                  method: "POST",
                  body: JSON.stringify({ email: newEmail.trim() }),
                }),
              );
              setNewEmail("");
            }}
          >
            suppress
          </Btn>
        </div>
        <Tbl head={["Contact", "Reason", "When", ""]}>
          {(supp.data?.suppressions ?? []).map((x: any) => (
            <tr key={x.email}>
              <td className="px-3 py-2 text-zinc-300">{x.email}</td>
              <td className="px-3 py-2">
                <Badge color={x.reason === "bounced" ? "red" : "amber"}>
                  {x.reason}
                </Badge>
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500">
                {x.createdAt ? new Date(x.createdAt).toLocaleDateString() : ""}
              </td>
              <td className="px-3 py-2 text-right">
                <Btn
                  variant="danger"
                  onClick={() =>
                    run(() =>
                      api("/api/suppressions", {
                        method: "DELETE",
                        body: JSON.stringify({ email: x.email }),
                      }),
                    )
                  }
                >
                  un-suppress
                </Btn>
              </td>
            </tr>
          ))}
          {!supp.data?.suppressions?.length && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-zinc-600">
                empty
              </td>
            </tr>
          )}
        </Tbl>
      </Card>
    </div>
  );
}
