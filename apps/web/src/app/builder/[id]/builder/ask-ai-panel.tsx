"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiApi, type AICredits } from "@/lib/api";
import { applyAIOperations, type AIOperation } from "@/lib/project-model/ai-apply";
import { collectModelDiagnostics } from "@/lib/project-model/diagnostics";
import { useBuilder } from "./builder-context";
import type { ProjectModelComponent, PropsMap } from "@/types/project";
import { ApiError } from "@/types/auth";
import { IconCheck, IconClose, IconSparkle } from "@/components/visuals/icons";

/**
 * The Ask AI panel (spec §31/§35): a persistent assistant that understands
 * project context. The AI returns a validated changeset (explanation +
 * closed-vocabulary operations); the user previews and applies it. The whole
 * applied changeset is ONE undoable commit — "Undo AI change" reverts
 * everything atomically. Nothing is applied without the user's consent.
 *
 * Auto-Fix (§AI-recheck): the Diagnostics panel seeds a fix prompt here; the
 * changeset flows through the same preview/apply pipeline and the applied
 * status reports the post-apply re-check (remaining errors/warnings).
 */

interface Turn {
  role: "user" | "ai";
  text: string;
  operations?: AIOperation[];
  status?: "proposed" | "applied" | "cancelled" | "failed";
}

const SUGGESTIONS = [
  "Create a login screen with email and password fields",
  "Add a welcome heading to this screen",
  "Make a card with a title and a button",
];

export function AskAIPanel({
  onClose,
  seedPrompt,
  onSeedConsumed,
}: {
  onClose: () => void;
  seedPrompt?: string | null;
  onSeedConsumed?: () => void;
}) {
  const { model, project, activeScreenId, selectedId, commitModel, codeDiagnostics } = useBuilder();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [credits, setCredits] = useState<AICredits | null>(null);

  const screen = model.screens.find((s) => s.id === activeScreenId) ?? model.screens[0];

  const reloadCredits = useCallback(() => {
    aiApi.credits().then((res) => setCredits(res.credits)).catch(() => setCredits(null));
  }, []);
  useEffect(() => {
    reloadCredits();
  }, [reloadCredits]);

  // Structured context (spec §59): compact items, never the whole project.
  // Current diagnostics ride along (capped) so fix requests and ordinary
  // requests alike see the project's actual health.
  const modelDiagnostics = useMemo(() => collectModelDiagnostics(model), [model]);

  const buildContext = useCallback(() => {
    const items: { kind: string; data?: unknown }[] = [];
    items.push({
      kind: "project",
      data: {
        name: project.name,
        type: project.type,
        startScreenId: model.navigation.startScreenId,
        screens: model.screens.map((s) => ({ id: s.id, name: s.name })),
        variables: model.variables.map((v) => ({ name: v.name, type: v.type })),
      },
    });
    for (const s of model.screens) {
      items.push({
        kind: "screen",
        data: {
          screenId: s.id,
          name: s.name,
          components: compactComponents(s.components),
          handlers: (s.logic?.handlers ?? []).map((h) => ({
            componentId: h.componentId,
            event: h.event,
            blocks: h.body.length,
          })),
        },
      });
    }
    const diagnosticItems = [
      ...modelDiagnostics.map((d) => ({
        severity: d.severity,
        message: d.message,
        screen: model.screens.find((s) => s.id === d.screenId)?.name,
      })),
      ...codeDiagnostics.map((d) => ({ severity: d.severity, message: d.message })),
    ].slice(0, 20);
    if (diagnosticItems.length > 0) {
      items.push({ kind: "diagnostics", data: { items: diagnosticItems } });
    }
    if (selectedId) {
      items.push({ kind: "selection", data: { componentId: selectedId } });
    }
    return items;
  }, [model, project, selectedId, modelDiagnostics, codeDiagnostics]);

  const compactComponents = (nodes: ProjectModelComponent[]): unknown =>
    nodes.map((node) => ({
      id: node.id,
      type: node.type,
      props: node.props,
      children: node.children ? compactComponents(node.children) : undefined,
    }));

  const runPrompt = useCallback(
    async (request: string) => {
      if (!request || busy) return;
      setTurns((current) => [...current, { role: "user", text: request }]);
      setBusy(true);
      try {
        const response = await aiApi.command(project.id, request, buildContext());
        setTurns((current) => [
          ...current,
          { role: "ai", text: response.explanation, operations: response.operations, status: "proposed" },
        ]);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "The AI request failed.";
        setTurns((current) => [...current, { role: "ai", text: message, status: "failed" }]);
        reloadCredits();
      } finally {
        setBusy(false);
      }
    },
    [busy, project.id, buildContext, reloadCredits],
  );

  // Auto-Fix entry point: the Diagnostics panel seeds a fix prompt; run it
  // once through the same pipeline, then release the seed.
  const lastSeed = useRef<string | null>(null);
  useEffect(() => {
    if (!seedPrompt || lastSeed.current === seedPrompt) return;
    lastSeed.current = seedPrompt;
    onSeedConsumed?.();
    void runPrompt(seedPrompt);
  }, [seedPrompt, runPrompt, onSeedConsumed]);

  const send = useCallback(() => {
    const request = prompt.trim();
    if (!request || busy) return;
    setPrompt("");
    void runPrompt(request);
  }, [prompt, busy, runPrompt]);

  const applyTurn = useCallback(
    (index: number) => {
      setTurns((current) => {
        const turn = current[index];
        if (!turn || !turn.operations) return current;
        const { model: next, applied, skipped } = applyAIOperations(model, turn.operations);
        if (applied.length === 0) {
          const updated = [...current];
          updated[index] = { ...turn, status: "failed", text: `${turn.text} — nothing could be applied.` };
          return updated;
        }
        commitModel(next, { origin: "ai" });
        const skippedNote = skipped.length > 0 ? ` (${skipped.length} skipped)` : "";
        // Re-check (spec §AI-recheck): diagnostics are derived from the model,
        // so recompute them against the applied result and report honestly.
        const remaining = collectModelDiagnostics(next);
        const errors = remaining.filter((d) => d.severity === "error").length;
        const warnings = remaining.filter((d) => d.severity === "warning").length;
        const recheck = ` Re-check: ${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"} remain.`;
        const updated = [...current];
        updated[index] = { ...turn, status: "applied", text: `${turn.text}${skippedNote}${recheck}` };
        return updated;
      });
    },
    [model, commitModel],
  );

  const cancelTurn = useCallback((index: number) => {
    setTurns((current) => {
      const updated = [...current];
      if (updated[index]) updated[index] = { ...updated[index]!, status: "cancelled" };
      return updated;
    });
  }, []);

  const describe = useCallback(
    (op: AIOperation): string => {
      switch (op.op) {
        case "createScreen": return `Create screen “${op.name}”`;
        case "setStartScreen": return "Set start screen";
        case "createComponent": return `Add ${op.componentType} to ${screenName(model, op.screenId)}`;
        case "updateComponent": return "Update component";
        case "deleteComponent": return "Delete component";
        case "createVariable": return `Create variable “${op.variableName}”`;
        case "deleteVariable": return `Delete variable “${op.variableName}”`;
        case "setScreenCode": return `Write custom code for ${screenName(model, op.screenId)}`;
        case "deleteHandler": return "Remove a broken handler";
        case "updateBlockInput": return `Retarget “${op.input ?? "input"}” on a block`;
        default: return op.op;
      }
    },
    [model],
  );

  return (
    <aside
      aria-label="Ask AI"
      className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-2xl"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2">
          <IconSparkle size={15} className="text-violet" />
          <h2 className="text-[14px] font-semibold">Ask AI</h2>
          {credits ? (
            <span
              title={`Resets ${new Date(credits.resetsAt).toLocaleTimeString()}`}
              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                credits.remaining > 0
                  ? "border-line text-mist"
                  : "border-rose/40 bg-rose/10 text-rose"
              }`}
            >
              {credits.remaining}/{credits.dailyLimit} free
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close Ask AI"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconClose size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-[13px] leading-6 text-fog">
              Describe what you want to build or change. Ideaven's AI works on
              your actual project — every change is previewed before it is
              applied, and undoable as one step.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPrompt(suggestion)}
                  className="rounded-lg border border-line bg-card px-3 py-2 text-left text-[12px] text-fog transition-colors hover:border-violet/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <li key={index} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-deep px-3 py-2 text-[13px] leading-5 text-white">
                    {turn.text}
                  </p>
                </li>
              ) : (
                <li key={index} className="flex flex-col gap-2">
                  <p
                    className={`max-w-[92%] rounded-2xl rounded-bl-md border px-3 py-2 text-[13px] leading-5 ${
                      turn.status === "failed"
                        ? "border-rose/30 bg-rose/10 text-rose"
                        : "border-line bg-card text-fog"
                    }`}
                  >
                    {turn.text}
                  </p>

                  {turn.operations && turn.status === "proposed" ? (
                    <div className="rounded-xl border border-violet/30 bg-violet/[0.06] p-3">
                      <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                        Proposed changes
                      </p>
                      <ul className="mt-2 flex flex-col gap-1">
                        {turn.operations.map((op, opIndex) => (
                          <li key={opIndex} className="text-[12px] text-fog">
                            <span className="text-mint">+</span> {describe(op)}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => applyTurn(index)}
                          className="h-8 flex-1 rounded-lg bg-violet-deep text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                        >
                          Apply changes
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelTurn(index)}
                          className="h-8 rounded-lg border border-line px-3 text-[12px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {turn.status === "applied" ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-mint">
                      <IconCheck size={12} /> Applied — Undo in the top bar reverts it as one step.
                    </p>
                  ) : null}
                  {turn.status === "cancelled" ? (
                    <p className="text-[11px] text-mist">Cancelled — nothing was changed.</p>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <form
        className="shrink-0 border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={screen ? `What should ${screen.name} do?` : "Describe your idea…"}
            aria-label="Ask AI"
            className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <button
            type="submit"
            disabled={busy || prompt.trim() === ""}
            className="h-9 shrink-0 rounded-lg bg-violet-deep px-3 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10.5px] leading-4 text-mist">
          AI changes are previewed before they are applied and revert as one
          step.
        </p>
      </form>
    </aside>
  );
}

function screenName(model: ReturnType<typeof useBuilder>["model"], screenId: string | undefined): string {
  const screen = model.screens.find((s) => s.id === screenId);
  return screen ? `“${screen.name}”` : "the screen";
}
