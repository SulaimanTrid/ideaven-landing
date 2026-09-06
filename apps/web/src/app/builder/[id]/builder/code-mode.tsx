"use client";

import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { screenToTypeScriptDetailed } from "@/lib/project-model/codegen";
import { syncScreenCode, type CodeSyncResult } from "@/lib/project-model/code-sync";
import { useBuilder } from "./builder-context";
import { IconCheck, IconClose } from "@/components/visuals/icons";

/**
 * Code mode: a real Monaco editor over the canonical model. The generated
 * TypeScript is editable; "Sync to blocks" parses the buffer with the
 * TypeScript compiler and converts it back to blocks when the whole screen
 * is inside the supported subset. Constructs outside the subset are stored
 * verbatim as custom code — never destroyed, never approximated. Parse
 * errors render as real editor markers and flow into the diagnostics panel.
 */

type CodeState = "visual" | "custom";

export function CodeMode() {
  const { model, activeScreenId, actions, setCodeDiagnostics } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId) ?? model.screens[0];

  const generated = useMemo(
    () => (screen ? screenToTypeScriptDetailed(model, screen) : null),
    [model, screen],
  );

  const hasCustom = typeof screen?.code === "string";
  const state: CodeState = hasCustom ? "custom" : "visual";

  const [draft, setDraft] = useState<string | null>(null);
  const [result, setResult] = useState<(CodeSyncResult & { stored?: boolean }) | null>(null);
  const [syncing, setSyncing] = useState(false);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const baseCode = screen ? (hasCustom ? (screen.code as string) : (generated?.code ?? "")) : "";
  const value = draft ?? baseCode;
  const dirty = draft !== null;

  const apply = useCallback(async () => {
    if (!screen || draft === null) return;
    setSyncing(true);
    try {
      const sync = await syncScreenCode(screen, draft);
      setCodeDiagnostics(sync.diagnostics);
      if (sync.status === "visual") {
        actions.applyCodeSync(screen.id, sync.handlers ?? []);
        setDraft(null);
        setResult({ status: "visual", diagnostics: [], stored: false });
      } else if (sync.status === "mixed" || sync.status === "code-only") {
        actions.setScreenCode(screen.id, draft);
        setDraft(null);
        setResult({ ...sync, stored: true });
      } else {
        setResult(sync);
      }
    } finally {
      setSyncing(false);
    }
  }, [screen, draft, actions, setCodeDiagnostics]);

  const removeCustom = useCallback(() => {
    if (!screen) return;
    actions.setScreenCode(screen.id, null);
    setDraft(null);
    setResult(null);
  }, [screen, actions]);

  // Live parse (debounced): drives editor markers and the diagnostics panel.
  useEffect(() => {
    if (!screen) return;
    const timer = setTimeout(() => {
      void syncScreenCode(screen, value).then((sync) => {
        setCodeDiagnostics(sync.status === "invalid" ? sync.diagnostics : []);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [screen, value, setCodeDiagnostics]);

  // Push parse errors into Monaco markers.
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const markers = result
      ? result.diagnostics.map((diag) => ({
          startLineNumber: diag.line,
          endLineNumber: diag.line,
          startColumn: diag.column,
          endColumn: diag.column + 12,
          message: diag.message,
          severity: monaco.MarkerSeverity.Error,
          source: "ideaven",
        }))
      : [];
    monaco.editor.setModelMarkers(editor.getModel() ?? null, "ideaven", markers);
  }, [result]);

  const onEditorMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  if (!screen || !generated) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-fog">
            Code for <span className="font-medium text-ink">{screen.name}</span>
          </p>
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
              state === "visual"
                ? "border-mint/30 bg-mint/10 text-mint"
                : "border-amber/30 bg-amber/10 text-amber"
            }`}
          >
            {state === "visual" ? "Generated from blocks" : "Custom code"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {state === "custom" ? (
            <button
              type="button"
              onClick={removeCustom}
              title="Delete the custom code for this screen and return to block-generated code"
              className="h-7 rounded-md border border-line px-2.5 text-[12px] text-fog transition-colors hover:border-rose/50 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              <IconClose size={11} className="mr-1 inline" />
              Remove custom code
            </button>
          ) : null}
          <button
            type="button"
            disabled={!dirty || syncing}
            onClick={() => void apply()}
            title="Parse this code: sync supported constructs to blocks, keep the rest safe"
            className="h-7 rounded-md bg-violet-deep px-3 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            {syncing ? "Parsing…" : "Sync to blocks"}
          </button>
        </div>
      </div>

      {/* Result / conflict panel */}
      {result ? <SyncResultPanel result={result} /> : null}

      {/* Monaco editor */}
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="typescript"
          theme="vs-dark"
          value={value}
          onChange={(next) => setDraft(next ?? "")}
          onMount={onEditorMount}
          loading={
            <div className="flex h-full items-center justify-center">
              <p className="font-mono text-xs tracking-[0.14em] text-mist uppercase">
                Loading editor…
              </p>
            </div>
          }
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            automaticLayout: true,
            tabSize: 2,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 16 },
            fixedOverflowWidgets: true,
          }}
        />
      </div>
    </div>
  );
}

function SyncResultPanel({ result }: { result: CodeSyncResult & { stored?: boolean } }) {
  if (result.status === "visual") {
    return (
      <div className="flex items-center gap-2 border-b border-mint/20 bg-mint/[0.06] px-4 py-2.5">
        <IconCheck size={14} className="text-mint" />
        <p className="text-[12px] text-fog">
          <span className="font-medium text-mint">Synced.</span> The blocks were
          updated from this code — switch to Blocks mode to see them.
        </p>
      </div>
    );
  }

  if (result.status === "invalid") {
    return (
      <div className="border-b border-rose/25 bg-rose/[0.06] px-4 py-2.5">
        <p className="text-[12px] font-medium text-rose">
          {result.diagnostics.length} parse error{result.diagnostics.length === 1 ? "" : "s"} — fix
          them to enable syncing (also shown in the editor and the Diagnostics
          panel).
        </p>
      </div>
    );
  }

  // mixed | code-only (stored as custom code)
  const unsupported = result.unsupported ?? [];
  return (
    <div className="border-b border-amber/25 bg-amber/[0.06] px-4 py-2.5">
      <p className="text-[12px] leading-5 text-fog">
        <span className="font-medium text-amber">Custom code — visual representation unavailable.</span>{" "}
        {result.stored
          ? "Your code was stored verbatim for this screen; the existing blocks were not touched."
          : ""}{" "}
        {unsupported.length} section{unsupported.length === 1 ? "" : "s"} cannot be represented as
        blocks.
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {unsupported.slice(0, 6).map((item, index) => (
          <li key={index} className="font-mono text-[11.5px] text-fog">
            <span className="text-amber">
              {item.line}:{item.column}
            </span>{" "}
            {item.snippet}
          </li>
        ))}
      </ul>
    </div>
  );
}
