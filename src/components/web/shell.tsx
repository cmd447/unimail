"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, useFetch } from "./api";

const NAV = [
  ["Home", "/app"],
  ["Senders", "/app/profiles"],
  ["Contacts", "/app/lists"],
  ["Templates", "/app/templates"],
  ["Campaigns", "/app/campaigns"],
  ["Compose", "/app/compose"],
  ["Settings", "/app/settings"],
] as const;

export default function WebShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data } = useFetch<{ profiles: any[] }>("/api/profiles");
  const active = data?.profiles?.find((p) => p.isActive);

  // Preload everything once the shell mounts — page chunks prefetched,
  // shared GETs warmed into the client cache. Navigations open instantly.
  useEffect(() => {
    for (const [, href] of NAV) router.prefetch(href);
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

  const linkCls = (href: string) => {
    const on = href === "/app" ? path === "/app" : path.startsWith(href);
    return `block px-2 py-1 text-xs uppercase ${
      on
        ? "bg-zinc-700 font-bold text-zinc-300"
        : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
    }`;
  };

  return (
    <div className="min-h-dvh bg-black font-mono text-xs text-zinc-300">
      {/* boxed header */}
      <header className="flex items-stretch border-b border-zinc-700">
        <Link
          href="/app"
          className="border-r border-zinc-700 px-3 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300"
        >
          UniMail
        </Link>
        <div className="hidden flex-1 items-center px-3 text-[11px] text-zinc-500 sm:flex">
          {active
            ? `sender: ${active.name} <${active.fromEmail}>`
            : "no sender active"}
        </div>
        <div className="flex-1 sm:hidden" />
        <Link
          href="/"
          className="border-l border-zinc-700 px-3 py-2 text-[11px] text-zinc-400 hover:bg-zinc-800"
          title="Switch to terminal mode"
        >
          [ terminal ]
        </Link>
        <button
          onClick={logout}
          className="border-l border-zinc-700 px-3 py-2 text-[11px] text-zinc-400 hover:bg-zinc-800"
        >
          [ log out ]
        </button>
      </header>

      {/* nav row (mobile) */}
      <nav className="flex overflow-x-auto border-b border-zinc-700 md:hidden">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href} className={`${linkCls(href)} whitespace-nowrap border-r border-zinc-800`}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex">
        {/* sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-40 shrink-0 border-r border-zinc-700 md:block">
          <div className="border-b border-zinc-800 px-2 py-1.5 text-[10px] uppercase text-zinc-600">
            menu
          </div>
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className={linkCls(href)}>
              {label}
            </Link>
          ))}
        </aside>
        <main className="min-w-0 flex-1 p-3 sm:p-4">{children}</main>
      </div>
    </div>
  );
}
