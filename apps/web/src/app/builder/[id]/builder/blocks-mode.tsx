"use client";

import { useEffect, useMemo, useState } from "react";
import { extensionApi } from "@/lib/api";
import { registerExtensionBlocks } from "@/lib/project-model/block-registry";
import { useBuilder } from "./builder-context";
import { BlocksCanvas } from "./blocks-canvas";
import type { ProjectModelComponent } from "@/types/project";

/**
 * Blocks mode (2.0 Phase 2): the Scratch-style canvas. Handlers come from
 * the screen's real components; blocks declared by installed extensions are
 * registered into the block vocabulary on entry (namespaced, honestly
 * skipped by codegen/preview until runtime providers exist).
 */
export function BlocksMode() {
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

  // Installed extensions contribute their declared blocks to the vocabulary.
  const [, setExtensionTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    extensionApi
      .installed()
      .then(({ extensions }) => {
        if (cancelled) return;
        for (const extension of extensions) {
          if (extension.manifest.blocks?.length) {
            registerExtensionBlocks(extension.slug, extension.name, extension.manifest.blocks);
          }
        }
        setExtensionTick((v) => v + 1);
      })
      .catch(() => {
        // Offline or API error: built-in vocabulary still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!screen) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <p className="text-[13px] text-fog">
          {model.type === "game" ? "Scene logic for " : "Blocks for "}<span className="font-medium text-ink">{screen.name}</span>
        </p>
        <p className="hidden text-[12px] text-mist sm:block">
          Drag blocks to snap · click to select · Del removes · Ctrl+wheel zooms
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!handler ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center">
            <p className="text-lg font-medium">No handler selected.</p>
            <p className="mt-2 text-sm leading-6 text-fog">
              Pick one on the left, or create a handler for a component event.
              Components you add in Design mode appear here automatically.
            </p>
          </div>
        ) : (
          <BlocksCanvas handler={handler} components={flatComponents} screenName={screen.name} />
        )}
      </div>
    </div>
  );
}
