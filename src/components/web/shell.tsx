"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  FileText,
  House,
  PenLine,
  Send,
  Server,
  Settings2,
  Users,
  Zap,
} from "lucide-react";
import { api, useFetch } from "./api";

const NAV = [
  { label: "Home", href: "/app", icon: House },
  { label: "SMTP", href: "/app/profiles", icon: Server },
  { label: "Contacts", href: "/app/lists", icon: Users },
  { label: "Letters", href: "/app/templates", icon: FileText },
  { label: "Blast", href: "/app/campaigns", icon: Zap },
  { label: "Compose", href: "/app/compose", icon: PenLine },
  { label: "Settings", href: "/app/settings", icon: Settings2 },
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

  const linkCls = (href: string) => {
    const on = isOn(href);
    return `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors duration-150 ${
      on
        ? "bg-zinc-800 font-medium text-zinc-100"
        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
    }`;
  };

  const senders = data?.profiles?.length ?? 0;

  return (
    <div className="min-h-dvh bg-[#0a0a0b] text-zinc-300">
      {/* top bar */}
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-zinc-800/80 bg-[#0a0a0b]/95 px-4 backdrop-blur">
        <Link
          href="/app"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100"
        >
          <Send className="h-4 w-4 text-zinc-400" strokeWidth={2} />
          UniMail
        </Link>
        <span className="hidden text-xs text-zinc-600 sm:inline">
          {senders
            ? `${senders} sender${senders === 1 ? "" : "s"} ready`
            : "no senders yet"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/"
            title="Switch to terminal mode"
            className="rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            Terminal
          </Link>
          <button
            onClick={logout}
            className="rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex">
        {/* sidebar */}
        <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-56 shrink-0 flex-col border-r border-zinc-800/80 md:flex">
          <nav className="flex flex-col gap-0.5 p-3">
            {NAV.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href} className={linkCls(href)}>
                <Icon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={isOn(href) ? 2.25 : 1.75}
                />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-zinc-800/80 px-5 py-3 font-mono text-[10px] text-zinc-600">
            unimail · self-hosted
          </div>
        </aside>

        {/* mobile nav row */}
        <nav className="flex w-full overflow-x-auto border-b border-zinc-800/80 md:hidden">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors ${
                isOn(href)
                  ? "border-b-2 border-zinc-200 font-medium text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
