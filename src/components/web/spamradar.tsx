"use client";

import { useEffect, useState } from "react";
import { applyAllFixes, spamReport, type Draft, type SpamIssue } from "@/lib/spamcheck";
import { api, useFetch } from "@/components/web/api";
import { Btn, Card } from "@/components/web/ui";

type AiHit = { severity: "critical" | "warn" | "info"; message: string; fix: string };

export function SpamRadar({
  subject,
  html,
  text,
  onApply,
}: {
  subject: string;
  html: string;
  text: string;
  onApply?: (d: Draft) => void;
}) {
  const settings = useFetch<{ settings: any }>("/api/settings");
  const aiOn = Boolean(settings.data?.settings?.aiEnabled);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiIssues, setAiIssues] = useState<AiHit[]>([]);
  const [aiErr, setAiErr] = useState<string | null>(null);

  // fresh letter = stale ai verdict
  useEffect(() => {
    setAiScore(null);
    setAiIssues([]);
    setAiErr(null);
  }, [subject, html]);

  const report = html.trim() ? spamReport(subject, html, text) : null;
  if (!report) return null;

  const draft: Draft = { subject, html, text };
  const fixable = report.issues.filter((i) => i.patch);

  const aiRewrite = async () => {
    setAiErr(null);
    try {
      const d = await api("/api/ai/letter", {
        method: "POST",
        body: JSON.stringify({ mode: "rewrite", ...draft }),
      });
      if (!d.ok) throw new Error(d.error);
      onApply?.({ subject: d.subject, html: d.html, text: d.text });
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "ai failed");
    }
  };

  const aiJudge = async () => {
    setAiErr(null);
    try {
      const d = await api("/api/ai/letter", {
        method: "POST",
        body: JSON.stringify({ mode: "judge", ...draft }),
      });
      if (!d.ok) throw new Error(d.error);
      setAiScore(d.score);
      setAiIssues(d.issues);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "ai failed");
    }
  };

  const sevCls = (s: string) =>
    s === "critical" ? "text-red-400" : s === "warn" ? "text-amber-400" : "text-zinc-500";
  const sevBorder = (s: string) =>
    s === "critical" ? "#f87171" : s === "warn" ? "#fbbf24" : "#52525b";

  return (
    <Card
      className={
        report.grade === "spammy"
          ? "border-red-900/70"
          : report.grade === "meh"
            ? "border-amber-900/60"
            : "border-emerald-900/60"
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-zinc-300">spam check</h3>
        <span
          className={`font-mono text-lg font-bold ${
            report.grade === "spammy"
              ? "text-red-400"
              : report.grade === "meh"
                ? "text-amber-400"
                : "text-emerald-400"
          }`}
        >
          {report.score}
        </span>
        <span className="text-xs uppercase text-zinc-500">
          {report.grade === "clean"
            ? "looks clean"
            : report.grade === "meh"
              ? "risky — fix the flags"
              : "spam folder bound"}
        </span>
        <span className="ml-auto flex gap-2">
          {aiOn && onApply && (
            <>
              <Btn onClick={aiJudge}>[ ai scan ]</Btn>
              <Btn variant="primary" onClick={aiRewrite}>[ ai rewrite ]</Btn>
            </>
          )}
          {onApply && fixable.length > 0 && (
            <Btn onClick={() => onApply(applyAllFixes(draft).draft)}>
              [ fix all ({fixable.length}) ]
            </Btn>
          )}
        </span>
      </div>

      {aiErr && <p className="mb-2 text-xs text-red-400">ai: {aiErr}</p>}

      {aiScore !== null && (
        <p className="mb-3 text-xs text-zinc-400">
          ai says: <span className="font-mono font-bold">{aiScore}/100</span>{" "}
          {aiScore >= 85 ? "— should land inbox" : aiScore >= 60 ? "— risky, rewrite it" : "— spam folder bound"}
        </p>
      )}
      {aiIssues.map((i, n) => (
        <div key={`ai-${n}`} className="mb-2 border-l-2 pl-2 text-xs" style={{ borderColor: sevBorder(i.severity) }}>
          <div className={sevCls(i.severity)}>
            <span className="text-zinc-600">[ai] </span>
            {i.message}
          </div>
          {i.fix ? <div className="mt-0.5 text-zinc-500">→ {i.fix}</div> : null}
        </div>
      ))}

      {report.issues.length ? (
        <div className="space-y-2">
          {report.issues.map((i: SpamIssue, n: number) => (
            <div
              key={n}
              className="border-l-2 pl-2 text-xs"
              style={{ borderColor: sevBorder(i.severity) }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={sevCls(i.severity)}>{i.message}</div>
                {onApply && i.patch && (
                  <Btn onClick={() => onApply(i.patch!(draft))}>
                    [ fix — {i.auto} ]
                  </Btn>
                )}
              </div>
              <div className="mt-0.5 text-zinc-500">→ {i.fix}</div>
            </div>
          ))}
        </div>
      ) : (
        !aiIssues.length && (
          <p className="text-xs text-emerald-400">
            clean — nothing tripping filters. ship it.
          </p>
        )
      )}
    </Card>
  );
}
