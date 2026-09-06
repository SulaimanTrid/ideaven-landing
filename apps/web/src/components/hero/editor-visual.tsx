"use client";

import { useState } from "react";
import { Palette } from "./editor/palette";
import { PreviewCanvas } from "./editor/preview-canvas";
import { Properties } from "./editor/properties";
import { ScriptStrip } from "./editor/script-strip";
import { TopBar } from "./editor/top-bar";
import type { EditorTab, EngineStatus } from "./editor/types";

/**
 * Miniature concept of the Ideaven creation environment — with a REAL
 * playable runtime: Run starts physics, ←/→/↑ (or the on-screen buttons)
 * drive the player, coins are collectible. Pause freezes, Stop resets.
 */
export function EditorVisual() {
  const [tab, setTab] = useState<EditorTab>("blocks");
  const [status, setStatus] = useState<EngineStatus>("ready");
  const [score, setScore] = useState(0);

  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_40px_80px_-40px_rgb(0_0_0_/_0.8)]">
      <TopBar
        status={status}
        onRun={() => setStatus("running")}
        onPause={() => setStatus("paused")}
        onStop={() => {
          setStatus("stopped");
          setScore(0);
        }}
      />

      <div className="flex min-w-0 flex-col sm:flex-row">
        <Palette className="hidden sm:flex" />
        <PreviewCanvas status={status} onScore={setScore} />
        <Properties className="hidden lg:flex" />
      </div>

      <ScriptStrip tab={tab} onTabChange={setTab} />

      <figcaption className="border-t border-line bg-panel/60 px-4 py-2 text-center font-mono text-[10.5px] tracking-[0.08em] text-mist">
        Playable concept — press Run, then ←/→/↑ (or the buttons) to play
      </figcaption>
    </figure>
  );
}
