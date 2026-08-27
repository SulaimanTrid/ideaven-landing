import { cn } from "@ideaven/ui";
import { IconBolt, IconPause, IconRun, IconSparkle, IconStop } from "@/components/visuals/icons";
import type { EngineStatus } from "./types";

function controlButtonClasses(disabled: boolean) {
  return cn(
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white/[0.04] text-fog transition-colors",
    disabled ? "pointer-events-none opacity-35" : "hover:border-white/25 hover:text-ink",
  );
}

type TopBarProps = {
  status: EngineStatus;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
};

/** Editor chrome: project identity plus Run / Pause / Stop / AI controls. */
export function TopBar({ status, onRun, onPause, onStop }: TopBarProps) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel/80 px-3">
      <span className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-fog">
        <IconBolt size={11} className="shrink-0 text-amber" />
        <span className="truncate">coin-run.scene</span>
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={controlButtonClasses(status === "running")}
          onClick={onRun}
          disabled={status === "running"}
          aria-label="Run project"
          title="Run"
        >
          <IconRun size={13} />
        </button>
        <button
          type="button"
          className={controlButtonClasses(status !== "running")}
          onClick={onPause}
          disabled={status !== "running"}
          aria-label="Pause project"
          title="Pause"
        >
          <IconPause size={13} />
        </button>
        <button
          type="button"
          className={controlButtonClasses(status === "ready" || status === "stopped")}
          onClick={onStop}
          disabled={status === "ready" || status === "stopped"}
          aria-label="Stop project"
          title="Stop"
        >
          <IconStop size={13} />
        </button>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />

        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-violet/40 bg-violet/10 px-2.5 font-mono text-[11px] tracking-[0.08em] text-violet uppercase transition-colors hover:bg-violet/20"
          aria-label="Ask Ideaven AI (concept)"
          title="Contextual AI — concept"
        >
          <IconSparkle size={12} />
          AI
        </button>
      </div>
    </div>
  );
}
