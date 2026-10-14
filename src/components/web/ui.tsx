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
    <div className="mb-6 border-b border-hairline pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase leading-none tracking-[-0.03em] text-phosphor">
            {title}
          </h1>
          {sub && <p className="micro mt-2">{sub}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
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
    <div className={`border border-hairline bg-panel p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Btn({
  children,
  variant = "suppress",
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "suppress" | "danger";
}) {
  const [pend, setPend] = React.useState(false);
  const cls =
    variant === "primary"
      ? "border-hazard bg-hazard text-white hover:bg-[#ff2a2a] hover:border-[#ff2a2a]"
      : variant === "danger"
        ? "border-hazard/60 text-hazard hover:bg-hazard/10"
        : "border-hairline-strong text-dim hover:border-dim hover:text-phosphor";
  return (
    <button
      className={`inline-flex items-center gap-1.5 border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150 focus-visible:outline-1 focus-visible:outline-dim disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5 ${cls}`}
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
  "w-full border border-hairline-strong bg-compartment px-3 py-2 font-mono text-[13px] text-phosphor placeholder-muted transition-colors duration-150 focus:border-dim focus:outline-none";

const labelCls = "micro mb-1.5 block";

export function Inp({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className={labelCls}>{label}</span>}
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
      {label && <span className={labelCls}>{label}</span>}
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
      {label && <span className={labelCls}>{label}</span>}
      <select className={`${inputCls} ${className}`} {...rest}>
        {children}
      </select>
    </label>
  );
}

/* status = colored crosshair + mono label. no tinted boxes. */
const dotColors: Record<string, string> = {
  green: "text-signal",
  red: "text-hazard",
  amber: "text-amber-500",
  zinc: "text-muted",
  blue: "text-sky-400",
};

export function Badge({
  color = "zinc",
  children,
}: {
  color?: keyof typeof dotColors;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${dotColors[color]}`}
    >
      <span aria-hidden>+</span>
      {children}
    </span>
  );
}

export function statusColor(s?: string): keyof typeof dotColors {
  switch (s) {
    case "sent": case "completed": case "verified": case "active": case "ok":
      return "green";
    case "failed": case "bounced": case "cancelled": case "tick-failed":
      return "red";
    case "sending": case "queued": case "resumed":
      return "blue";
    case "paused": case "scheduled": case "skipped": case "draft": case "chain":
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
      <table className="w-full border-collapse text-left font-mono text-xs">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="micro border-b border-hairline px-3 py-2.5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline/60 [&>tr]:transition-colors [&>tr:hover]:bg-compartment">
          {children}
        </tbody>
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
    <td className={`px-3 py-2.5 align-top ${className}`} {...rest}>
      {children}
    </td>
  );
}

export function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="mb-4 font-mono text-xs text-hazard">{msg}</div>;
}

export function Note({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <div className={`mb-4 font-mono text-xs ${msg.ok ? "text-signal" : "text-hazard"}`}>
      {msg.text}
    </div>
  );
}
