"use client";

import { useEffect, useMemo, useState } from "react";
import { extensionApi } from "@/lib/api";
import { forgetExtensionBlocks, registerExtensionBlocks } from "@/lib/project-model/block-registry";
import { useBuilder } from "./builder-context";
import { BlocksCanvas } from "./blocks-canvas";
import { BlocksDndProvider } from "./blocks-dnd";
import { BlockPalette } from "./blocks-side";
import type { ProjectModelComponent } from "@/types/project";

/**
 * Blocks mode: the Scratch-style free canvas. All of a screen's handlers are
 * scripts on one workspace; blocks declared by installed extensions are
 * registered into the block vocabulary on entry (namespaced, honestly
 * skipped by codegen/preview until runtime providers exist). The provider
 * owns the pointer-drag gesture shared by the palette and the canvas.
 *
 * TASK 64 §16/§18: only ENABLED installs register their blocks — disabling
 * an extension removes its blocks from the active palette while project
 * models keep their references (skipped blocks render via category fallback
 * and the runtime reports the skip honestly). Registration reloads whenever
 * the extensions dashboard dispatches `ideaven:extensions-changed`.
 */
export function BlocksMode({ extensionsTick = 0 }: { extensionsTick?: number }) {
  const { model, activeScreenId, selectedHandlerId } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId);
  const handlers = screen?.logic?.handlers ?? [];
  const handler = handlers.find((h) => h.id === selectedHandlerId) ?? null;

  const flatComponents = useMemo(() => {
    const list: ProjectModelComponent[] = [];
    const walk = (nodes: ProjectModelComponent[]) => {
      for (const node of nodes) {
        list.push(node);
        if (node.children) walk(node.children);
      }
    };
    if (screen) walk(screen.components);
    return list;
  }, [screen]);

  if (!screen) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <p className="text-[13px] text-fog">
          {model.type === "game" ? "Scene logic for " : "Blocks for "}
          <span className="font-medium text-ink">{screen.name}</span>
        </p>
        <p className="hidden text-[12px] text-mist sm:block">
          Drag blocks onto a script to connect · drop on free canvas to park · Del removes · Ctrl+wheel zooms
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <BlocksCanvas key={extensionsTick} screen={screen} components={flatComponents} screenName={screen.name} />
      </div>    </div>
  );
}

/**
 * Blocks mode workspace: the canvas plus the palette rail, sharing one drag
 * controller. Rendered as a fragment so it slots into the builder's
 * left-rail / center / right-rail flex row unchanged. TASK 64: extension
 * block registration lives in BlocksMode (with the enabled filter).
 */
export function BlocksWorkspace() {
  // TASK 64 §16/§18: ONE registration owner — the workspace loads installed
  // extensions, registers only ENABLED ones (disabled slugs are forgotten so
  // stale vocabulary never lingers), and re-keys the canvas + palette on
  // every `ideaven:extensions-changed` event.
  const [extensionsTick, setExtensionsTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    extensionApi
      .installed()
      .then(({ extensions }) => {
        if (cancelled) return;
        for (const extension of extensions) {
          if (extension.enabled === false) {
            forgetExtensionBlocks(extension.slug);
            continue;
          }
          if (extension.manifest.blocks?.length) {
            registerExtensionBlocks(extension.slug, extension.name, extension.manifest.blocks);
          }
        }
        setExtensionsTick((v) => v + 1);
      })
      .catch(() => {
        // Offline or API error: built-in vocabulary still works.
      });
    const onChanged = () => setExtensionsTick((v) => v + 1);
    window.addEventListener("ideaven:extensions-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ideaven:extensions-changed", onChanged);
    };
  }, []);
  return (
    <BlocksDndProvider>
      <BlocksMode extensionsTick={extensionsTick} />
      <BlocksPaletteRail extensionsTick={extensionsTick} />
    </BlocksDndProvider>
  );
}

function BlocksPaletteRail({ extensionsTick }: { extensionsTick: number }) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-panel lg:flex">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-3 pb-1">
          <h3 className="px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Blocks</h3>
        </div>
        <BlockPalette extensionTick={extensionsTick} />
        <div className="h-6" />
      </div>
    </aside>
  );
}
