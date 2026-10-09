"use client";

import React from "react";

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
      <div>
        <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-300">
          {title}
        </h1>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-l border-zinc-800 bg-black py-2 pl-3 ${className}`}>
      {children}
    </div>
  );
}

export function Btn({
  children,
  variant = "ghost",
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const [pend, setPend] = React.useState(false);
  const cls =
    variant === "primary"
      ? "border-zinc-500 bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
      : variant === "danger"
        ? "border-red-800 text-red-400 hover:bg-red-950/40"
        : "border-zinc-600 text-zinc-300 hover:bg-zinc-800";
  return (
    <button
      className={`border px-2 py-1 text-xs disabled:opacity-40 ${cls}`}
      disabled={disabled || pend}
      onClick={async (e) => {
        const r = onClick?.(e) as unknown;
        if (r && typeof (r as Promise<unknown>).then === "function") {
          setPend(true);
          try {
            await r;
          } finally {
            setPend(false);
          }
        }
      }}
      {...rest}
    >
      {children}
      {pend && "…"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-600 bg-black px-2 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-300";

export function Inp({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-[11px] uppercase text-zinc-500">
          {label}
        </span>
      )}
      <input className={inputCls} {...rest} />
    </label>
  );
}

export function Area({
  label,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-[11px] uppercase text-zinc-500">
          {label}
        </span>
      )}
      <textarea className={inputCls} spellCheck={false} {...rest} />
    </label>
  );
}

export function Sel({
  label,
  children,
  className = "",
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-[11px] uppercase text-zinc-500">
          {label}
        </span>
      )}
      <select className={`${inputCls} ${className}`} {...rest}>
        {children}
      </select>
    </label>
  );
}

const badgeColors: Record<string, string> = {
  green: "border-emerald-700 text-emerald-400",
  red: "border-red-800 text-red-400",
  amber: "border-amber-700 text-amber-400",
  zinc: "border-zinc-600 text-zinc-400",
  blue: "border-sky-700 text-sky-400",
};

export function Badge({
  color = "zinc",
  children,
}: {
  color?: keyof typeof badgeColors;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`ml-1 inline-block border px-1.5 py-px text-[10px] uppercase ${badgeColors[color]}`}
    >
      {children}
    </span>
  );
}

export function statusColor(s?: string): keyof typeof badgeColors {
  switch (s) {
    case "sent": case "completed": case "verified": case "active": case "ok":
      return "green";
    case "failed": case "bounced": case "cancelled":
      return "red";
    case "sending": case "queued": case "resumed":
      return "blue";
    case "paused": case "scheduled": case "skipped": case "draft":
      return "amber";
    default:
      return "zinc";
  }
}

export function Tbl({
  head,
  children,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-zinc-800 px-2 py-1.5 text-[11px] font-bold uppercase text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className = "",
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`border-b border-zinc-900 px-2 py-1.5 ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="mb-3 border border-red-800 px-2 py-1.5 text-xs text-red-400">
      ERROR: {msg}
    </div>
  );
}

export function Note({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <div
      className={`mb-3 border px-2 py-1.5 text-xs ${
        msg.ok
          ? "border-emerald-800 text-emerald-400"
          : "border-red-800 text-red-400"
      }`}
    >
      {msg.ok ? "" : "ERROR: "}
      {msg.text}
    </div>
  );
}
