"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@ideaven/ui";
import { CollisionScriptBlocks } from "@/components/visuals/script-blocks";
import type { EditorTab } from "./types";

/* ------------------------------------------------------------------ */
/* CODE view — tokenized TypeScript with a typing simulation           */
/* ------------------------------------------------------------------ */

/** [text, colorClass] pairs; whitespace is significant. */
const CODE_TOKENS: ReadonlyArray<readonly [string, string?]> = [
  ["api", "text-mint"],
  [".onEvent", "text-sky"],
  ["(", "text-mist"],
  ["screen", "text-mint"],
  [", ", "text-mist"],
  ["\"initialize\"", "text-amber"],
  [", ", "text-mist"],
  ["() ", "text-mist"],
  ["=>", "text-violet"],
  [" {", "text-mist"],
  ["\n  api.", undefined],
  ["setVariable", "text-sky"],
  ["(", "text-mist"],
  ['"score"', "text-amber"],
  [", ", "text-mist"],
  ["0", "text-rose"],
  [");", "text-mist"],
  ["\n  api.", undefined],
  ["navigate", "text-sky"],
  ["(", "text-mist"],
  ['"screen-gameover"', "text-amber"],
  [");", "text-mist"],
  ["\n}", undefined],
];

function CodeScript() {
  const total = useMemo(
    () => CODE_TOKENS.reduce((sum, [text]) => sum + text.length, 0),
    [],
  );
  // Start fully rendered (SSR / no-JS safe), then replay the typing effect.
  const [typed, setTyped] = useState(total);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(total);
      return;
    }
    setTyped(0);
    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      setTyped(count);
      if (count >= total) window.clearInterval(id);
    }, 26);
    return () => window.clearInterval(id);
  }, [total]);

  let consumed = 0;
  const rendered = CODE_TOKENS.map(([text, cls], index) => {
    const start = consumed;
    consumed += text.length;
    if (typed <= start) return null;
    const visible = typed >= consumed ? text : text.slice(0, typed - start);
    return (
      <span key={index} className={cls}>
        {visible}
      </span>
    );
  });

  return (
    <pre className="flex gap-4 overflow-x-auto font-mono text-[12.5px] leading-6">
      <span aria-hidden="true" className="select-none text-mist/50">
        1<br />
        2<br />
        3<br />
        4<br />
        5<br />
        6
      </span>
      <code className="whitespace-pre text-fog">
        {rendered}
        <span
          aria-hidden="true"
          className="anim-caret ml-px inline-block h-[13px] w-[7px] translate-y-[2px] bg-violet/90"
        />
      </code>
    </pre>
  );
}

/* ------------------------------------------------------------------ */

type ScriptStripProps = {
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
};

export function ScriptStrip({ tab, onTabChange }: ScriptStripProps) {
  return (
    <div className="border-t border-line bg-panel/60">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex gap-1">
          {(
            [
              ["blocks", "Blocks"],
              ["code", "Code"],
            ] as const
          ).map(([value, label]) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onTabChange(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors",
                  active ? "bg-violet/15 text-violet" : "text-mist hover:text-fog",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="hidden font-mono text-[10px] text-mist sm:block">
          coin.script
        </p>
      </div>
      <div className="min-h-[136px] overflow-x-auto px-4 py-4">
        {tab === "blocks" ? (
          <CollisionScriptBlocks key="blocks" />
        ) : (
          <CodeScript key="code" />
        )}
      </div>
    </div>
  );
}
