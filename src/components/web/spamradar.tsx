"use client";

import { applyAllFixes, spamReport, type Draft, type SpamIssue } from "@/lib/spamcheck";
import { Btn, Card } from "@/components/web/ui";

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
  const report = html.trim() ? spamReport(subject, html, text) : null;
  if (!report) return null;

  const draft: Draft = { subject, html, text };
  const fixable = report.issues.filter((i) => i.patch);

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
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-medium text-zinc-300">spam radar</h3>
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
            ? "inbox-bound"
            : report.grade === "meh"
              ? "sketchy — fix the flags"
              : "spam folder bound"}
        </span>
        {onApply && fixable.length > 0 && (
          <Btn
            variant="primary"
            className="ml-auto"
            onClick={() => onApply(applyAllFixes(draft).draft)}
          >
            [ fix all ({fixable.length}) ]
          </Btn>
        )}
      </div>
      {report.issues.length ? (
        <div className="space-y-2">
          {report.issues.map((i: SpamIssue, n: number) => (
            <div
              key={n}
              className="border-l-2 pl-2 text-xs"
              style={{
                borderColor:
                  i.severity === "critical"
                    ? "#f87171"
                    : i.severity === "warn"
                      ? "#fbbf24"
                      : "#52525b",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={
                    i.severity === "critical"
                      ? "text-red-400"
                      : i.severity === "warn"
                        ? "text-amber-400"
                        : "text-zinc-500"
                  }
                >
                  {i.message}
                </div>
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
        <p className="text-xs text-emerald-400">
          clean — nothing tripping filters. ship it.
        </p>
      )}
    </Card>
  );
}
