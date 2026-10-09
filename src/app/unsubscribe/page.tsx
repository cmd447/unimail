"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailX } from "lucide-react";

function UnsubscribeInner() {
  const sp = useSearchParams();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const c = sp.get("c") ?? "";
  const m = sp.get("m") ?? "";

  async function confirm() {
    setState("busy");
    const res = await fetch(`/api/unsubscribe?c=${c}&m=${m}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setState(data.ok ? "done" : "error");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <MailX className="mx-auto mb-4 text-neutral-400" size={28} />
        {state === "done" ? (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Unsubscribed</h1>
            <p className="mt-2 text-sm text-neutral-500">
              You won't receive any more emails from this sender.
            </p>
          </>
        ) : state === "error" ? (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Link expired</h1>
            <p className="mt-2 text-sm text-neutral-500">
              This unsubscribe link is no longer valid.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">Unsubscribe</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Confirm you want to stop receiving these emails.
            </p>
            <button
              onClick={confirm}
              disabled={state === "busy" || !c || !m}
              className="mt-5 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {state === "busy" ? "Working…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeInner />
    </Suspense>
  );
}
