"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { runCommand, type Term, type TermCtx } from "./commands";

// types

export type InputMode =
  | "text"
  | "email"
  | "numeric"
  | "tel"
  | "url"
  | "decimal";

interface Line {
  id: number;
  text: string;
  cls?: "err" | "ok" | "dim" | "accent" | "input";
}

interface PromptSpec {
  label: string;
  secret?: boolean;
  inputMode?: InputMode;
  type?: string;
  allowEmpty?: boolean;
}

type Mode = "cmd" | "prompt" | "multi" | "more";

const PAGE = 22;
const PROMPT = "C:\\UniMail>";

let lineId = 0;
const L = (text: string, cls?: Line["cls"]): Line => ({ id: ++lineId, text, cls });

// component

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<Mode>("cmd");
  const [input, setInput] = useState("");
  const [label, setLabel] = useState(PROMPT);
  const [secret, setSecret] = useState(false);
  const [kb, setKb] = useState<{ inputMode: InputMode; type: string }>({
    inputMode: "text",
    type: "text",
  });
  const [running, setRunning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resolver = useRef<((v: string) => void) | null>(null);
  const multiBuf = useRef<string[]>([]);
  const multiResolve = useRef<((v: string[]) => void) | null>(null);
  const moreQueue = useRef<string[]>([]);
  const history = useRef<string[]>([]);
  const hIdx = useRef(-1);
  const fileResolve = useRef<((f: File | null) => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);

  const print = useCallback((...texts: string[]) => {
    setLines((l) => [...l, ...texts.map((t) => L(t))]);
  }, []);

  const cls = useCallback(() => setLines([]), []);

  // prompt machinery

  const ask = useCallback(
    (lbl: string, spec?: Omit<PromptSpec, "label">) =>
      new Promise<string>((resolve) => {
        resolver.current = resolve;
        setLabel(lbl);
        setSecret(Boolean(spec?.secret));
        setKb({
          inputMode: spec?.inputMode ?? "text",
          type: spec?.type ?? (spec?.secret ? "password" : "text"),
        });
        setInput("");
        setMode("prompt");
      }),
    [],
  );

  const multi = useCallback((hint: string) => {
    multiBuf.current = [];
    print(
      hint || "(paste lines; a single '.' on its own line finishes)",
      "",
    );
    setLabel("");
    setSecret(false);
    setKb({ inputMode: "text", type: "text" });
    setInput("");
    setMode("multi");
    return new Promise<string[]>((resolve) => {
      multiResolve.current = resolve;
    });
  }, [print]);

  const page = useCallback(
    (rows: string[]) => {
      if (rows.length <= PAGE) {
        print(...rows);
        return;
      }
      moreQueue.current = rows.slice(PAGE);
      print(...rows.slice(0, PAGE), "-- More --");
      setMode("more");
    },
    [print],
  );

  const pickFile = useCallback(
    () =>
      new Promise<File | null>((resolve) => {
        fileResolve.current = resolve;
        fileRef.current?.click();
      }),
    [],
  );

  const term = useRef<Term>({
    print,
    page,
    cls,
    ask,
    multi,
    pickFile,
    confirm: (q) => ask(`${q} (y/n): `).then((v) => /^y/i.test(v.trim())),
  }).current;

  const ctx = useRef<TermCtx>({
    authed: false,
    authReason: undefined,
    activeProfileId: null,
    draft: null,
  }).current;

  // boot

  useEffect(() => {
    (async () => {
      print(
        "Microsoft Windows [Version 10.0.26200.7019]",
        "(c) Microsoft Corporation. All rights reserved.",
        "",
        "C:\\Users\\world>unimail",
        "",
        "UniMail — the sender  v1.0",
        "type 'help' for the menu · ctrl+c bails · ctrl+l wipes",
        "",
      );
      try {
        const r = await fetch("/api/session");
        const d = await r.json();
        ctx.authed = d.authed;
        ctx.authReason = d.reason;
        if (d.authed) print("still logged in — 'whoami' for the sitch.");
        else print(`not logged in (${d.reason ?? "unknown"}) — 'login' to get in.`);
      } catch {
        print("not logged in (couldn't reach session api) — 'login' to get in.");
      }
      print("");
    })();
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // key handling

  const finishInput = useCallback(
    (echo: string) => {
      setLines((l) => [...l, L(`${label}${echo}`, "input")]);
      setInput("");
    },
    [label],
  );

  const abort = useCallback(() => {
    print("^C");
    if (resolver.current) {
      resolver.current("");
      resolver.current = null;
    }
    if (multiResolve.current) {
      multiResolve.current([]);
      multiResolve.current = null;
    }
    if (moreQueue.current.length) moreQueue.current = [];
    setSecret(false);
    setKb({ inputMode: "text", type: "text" });
    setLabel(PROMPT);
    setMode("cmd");
    setInput("");
  }, [print]);

  const handleEnter = useCallback(async () => {
    const raw = input;

    if (mode === "prompt" && resolver.current) {
      finishInput(secret ? "•".repeat(raw.length) : raw);
      const r = resolver.current;
      resolver.current = null;
      setSecret(false);
      setKb({ inputMode: "text", type: "text" });
      setLabel(PROMPT);
      setMode("cmd");
      r(raw);
      return;
    }

    if (mode === "multi") {
      if (raw.trim() === ".") {
        setLabel(PROMPT);
        setMode("cmd");
        print("");
        multiResolve.current?.(multiBuf.current);
        multiResolve.current = null;
      } else {
        multiBuf.current.push(raw);
        print(raw);
      }
      setInput("");
      return;
    }

    if (mode === "more") {
      const next = moreQueue.current.slice(0, PAGE);
      moreQueue.current = moreQueue.current.slice(PAGE);
      print(...next);
      if (moreQueue.current.length) print("-- More --");
      else setMode("cmd");
      return;
    }

    // cmd mode
    finishInput(raw);
    const trimmed = raw.trim();
    if (!trimmed) return;
    history.current.push(trimmed);
    hIdx.current = -1;

    setRunning(true);
    runningRef.current = true;
    try {
      await runCommand(trimmed, term, ctx);
    } catch (e) {
      print(e instanceof Error ? e.message : "Command failed");
    } finally {
      setRunning(false);
      runningRef.current = false;
    }
  }, [input, mode, secret, finishInput, print, term, ctx]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleEnter();
      } else if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        abort();
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        cls();
      } else if (e.key === "ArrowUp" && mode === "cmd") {
        e.preventDefault();
        if (history.current.length) {
          hIdx.current =
            hIdx.current < 0
              ? history.current.length - 1
              : Math.max(0, hIdx.current - 1);
          setInput(history.current[hIdx.current]);
        }
      } else if (e.key === "ArrowDown" && mode === "cmd") {
        e.preventDefault();
        if (hIdx.current >= 0) {
          hIdx.current++;
          if (hIdx.current >= history.current.length) {
            hIdx.current = -1;
            setInput("");
          } else setInput(history.current[hIdx.current]);
        }
      } else if (mode === "more") {
        e.preventDefault();
        if (e.key === "q" || e.key === "Q") {
          moreQueue.current = [];
          setMode("cmd");
          print("");
        } else {
          handleEnter();
        }
      }
    },
    [handleEnter, abort, cls, mode, print],
  );

  // render

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines, input, label]);

  const echo = secret ? "•".repeat(input.length) : input;

  return (
    <div
      className="h-dvh w-full select-text overflow-hidden bg-[#0c0c0c] font-[Consolas,'Cascadia_Mono','Lucida_Console',monospace] text-[14px] leading-[1.3] text-[#cccccc] sm:text-[15px]"
      onClick={() => inputRef.current?.focus()}
      ref={scrollRef}
      style={{ overflowY: "auto" }}
    >
      <div className="mx-auto min-h-full max-w-full p-3 sm:p-4">
        {lines.map((l) => (
          <div
            key={l.id}
            className={`whitespace-pre-wrap break-words ${
              l.cls === "err"
                ? "text-[#f48771]"
                : l.cls === "ok"
                  ? "text-[#6a9955]"
                  : l.cls === "dim"
                    ? "text-[#808080]"
                    : l.cls === "accent"
                      ? "text-[#dcdcaa]"
                      : ""
            }`}
          >
            {l.text || " "}
          </div>
        ))}

        {/* active input line */}
        <div className="whitespace-pre-wrap break-words">
          <span>{label}</span>
          <span className="text-[#e8e8e8]">{echo}</span>
          <span className="cursor-blink text-[#e8e8e8]">▌</span>
          {running && mode === "cmd" && (
            <span className="text-[#808080]"> ⏳</span>
          )}
        </div>
      </div>

      {/* real input — invisible; controls the on-screen keyboard mode */}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        type={kb.type}
        inputMode={kb.inputMode}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="terminal input"
        className="fixed left-0 top-0 h-px w-px opacity-0"
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          fileResolve.current?.(e.target.files?.[0] ?? null);
          fileResolve.current = null;
          e.target.value = "";
        }}
      />
    </div>
  );
}
