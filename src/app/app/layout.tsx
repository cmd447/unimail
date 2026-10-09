"use client";

import { useEffect, useState } from "react";
import WebShell from "@/components/web/shell";

// Client-side gate: shell renders instantly (fast navs), session check
// streams in after mount and bounces unauth users to the terminal.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        if (d.authed) setOk(true);
        else window.location.href = "/";
      })
      .catch(() => setOk(true)); // don't trap user on a flaky check
  }, []);

  if (ok === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black font-mono text-xs text-zinc-600">
        checking session…
      </div>
    );
  }
  return <WebShell>{children}</WebShell>;
}
