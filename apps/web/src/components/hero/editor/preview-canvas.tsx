import { useId } from "react";
import { cn } from "@ideaven/ui";
import type { EngineStatus } from "./types";

const COINS = [
  { cx: 92, cy: 112 },
  { cx: 178, cy: 76 },
  { cx: 262, cy: 112 },
];

const STATUS_STYLE: Record<EngineStatus, { label: string; dot: string; text: string }> = {
  ready: { label: "Ready", dot: "bg-mist", text: "text-mist" },
  running: { label: "Running", dot: "bg-mint anim-pulse-dot", text: "text-mint" },
  paused: { label: "Paused", dot: "bg-amber", text: "text-amber" },
  stopped: { label: "Stopped", dot: "bg-rose", text: "text-rose" },
};

type PreviewCanvasProps = {
  status: EngineStatus;
  score: number;
  className?: string;
};

/** Center panel: a miniature platformer scene that reacts to Run/Pause/Stop. */
export function PreviewCanvas({ status, score, className }: PreviewCanvasProps) {
  const gridId = useId();
  const statusStyle = STATUS_STYLE[status];

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col p-3", className)}>
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
          Preview · main
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase",
            statusStyle.text,
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", statusStyle.dot)}
          />
          {statusStyle.label}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-[#0c0f17]">
        <svg
          viewBox="0 0 320 200"
          className="block w-full"
          role="img"
          aria-label={`Miniature platformer preview: a small character on floating platforms with three coins. Status: ${statusStyle.label}, score ${score}.`}
        >
          <defs>
            <pattern id={gridId} width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="0.8" fill="rgb(231 234 246 / 0.05)" />
            </pattern>
          </defs>

          <rect width="320" height="200" fill="#0c0f17" />
          <rect width="320" height="200" fill={`url(#${gridId})`} />

          {/* ground */}
          <rect x="0" y="170" width="320" height="30" fill="#151b29" />
          <rect x="0" y="170" width="320" height="2" fill="#232c40" />

          {/* platforms */}
          {[
            { x: 26, y: 124, w: 86 },
            { x: 150, y: 88, w: 78 },
            { x: 238, y: 126, w: 58 },
          ].map((p) => (
            <g key={p.x}>
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height="9"
                rx="3"
                fill="#1b2130"
              />
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height="2.5"
                rx="1.25"
                fill="#2a3348"
              />
            </g>
          ))}

          {/* coins */}
          {COINS.map((coin, index) => (
            <g
              key={`${coin.cx}-${coin.cy}`}
              style={{
                opacity: index < score ? 0.15 : 1,
                transition: "opacity 0.35s ease",
              }}
            >
              <circle cx={coin.cx} cy={coin.cy} r="5" fill="var(--color-amber)" />
              <circle
                cx={coin.cx}
                cy={coin.cy}
                r="2"
                fill="rgb(10 12 18 / 0.35)"
              />
            </g>
          ))}

          {/* character */}
          <g
            className={status === "running" ? "anim-bob" : undefined}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <rect
              x="58"
              y="104"
              width="20"
              height="20"
              rx="5"
              fill="var(--color-mint)"
            />
            <rect x="61" y="108" width="6" height="7" rx="3" fill="rgb(10 12 18 / 0.85)" />
            <rect x="70" y="108" width="6" height="7" rx="3" fill="rgb(10 12 18 / 0.85)" />
          </g>

          {/* HUD */}
          <text
            x="12"
            y="21"
            fill="#a9b0c2"
            fontFamily="var(--font-mono)"
            fontSize="9.5"
            letterSpacing="1.5"
          >
            SCORE {String(score).padStart(2, "0")}
          </text>
        </svg>
      </div>
    </div>
  );
}
