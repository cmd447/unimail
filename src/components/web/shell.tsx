"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, useFetch } from "./api";

const NAV = [
  { label: "Home", href: "/app" },
  { label: "SMTP", href: "/app/profiles" },
  { label: "Contacts", href: "/app/lists" },
  { label: "Letters", href: "/app/templates" },
  { label: "Blast", href: "/app/campaigns" },
  { label: "Compose", href: "/app/compose" },
  { label: "Settings", href: "/app/settings" },
] as const;

export default function WebShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data } = useFetch<{ profiles: any[] }>("/api/profiles");

  // Preload everything once the shell mounts — page chunks prefetched,
  // shared GETs warmed into the client cache. Navigations open instantly.
  useEffect(() => {
    for (const { href } of NAV) router.prefetch(href);
    const warm = [
      "/api/profiles",
      "/api/lists",
      "/api/templates",
      "/api/campaigns",
      "/api/settings",
      "/api/suppressions",
      "/api/events?limit=300",
    ];
    const t = setTimeout(() => {
      for (const p of warm) api(p).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [router]);

  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" });
    window.location.assign("/");
  };

  const isOn = (href: string) =>
    href === "/app" ? path === "/app" : path.startsWith(href);

  const senders = data?.profiles?.length ?? 0;

  return (
    <div className="min-h-dvh bg-substrate text-phosphor">
      {/* compartment header */}
      <header className="sticky top-0 z-40 flex h-11 items-stretch border-b border-hairline bg-substrate font-mono">
        <Link
          href="/app"
          className="flex items-center gap-2 border-r border-hairline px-4 font-display text-sm font-bold uppercase tracking-[-0.02em] text-phosphor"
        >
          UniMail
        </Link>
        <div className="micro hidden items-center px-4 sm:flex">
          <span className={senders ? "text-signal" : ""}>
            {senders ? `${senders} sender${senders === 1 ? "" : "s"}` : "no senders"}
          </span>
        </div>
        <div className="flex-1" />
        <Link
          href="/"
          title="Switch to terminal mode"
          className="micro flex items-center border-l border-hairline px-4 transition-colors hover:bg-compartment hover:text-phosphor"
        >
          terminal
        </Link>
        <button
          onClick={logout}
          className="micro flex items-center border-l border-hairline px-4 transition-colors hover:bg-compartment hover:text-phosphor"
        >
          log out
        </button>
      </header>

      <div className="flex flex-col md:flex-row">
        {/* sidebar */}
        <aside className="sticky top-11 hidden h-[calc(100dvh-2.75rem)] w-52 shrink-0 flex-col border-r border-hairline md:flex">
          <nav className="flex flex-col">
            {NAV.map(({ label, href }, i) => {
              const on = isOn(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center gap-3 border-b border-hairline px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 ${
                    on
                      ? "bg-compartment text-phosphor"
                      : "text-muted hover:bg-compartment hover:text-dim"
                  }`}
                >
                  <span className={on ? "text-hazard" : "text-hairline-strong group-hover:text-dim"}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {label}
                  {on && <span className="ml-auto text-hazard">+</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* mobile nav row */}
        <nav className="sticky top-11 z-30 flex w-full overflow-x-auto border-b border-hairline bg-substrate md:hidden">
          {NAV.map(({ label, href }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 whitespace-nowrap border-r border-hairline px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                isOn(href) ? "bg-compartment text-phosphor" : "text-muted"
              }`}
            >
              <span className={isOn(href) ? "text-hazard" : "text-hairline-strong"}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
