"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@ideaven/ui";
import { DeviceFrame } from "@/components/builder/device-frame";
import type { EngineStatus } from "./types";

/**
 * Center panel: a REAL playable miniature platformer. Run starts the
 * physics loop; ←/→ (or A/D) move, ↑/W/Space jumps; collect all three coins
 * to clear. On-screen buttons mirror the keys for touch. Pause freezes,
 * Stop resets. This is the same idea as the builder's runtime: the blocks
 * describe behavior, the preview executes it.
 */

const GRAVITY = 1500; // px/s²
const MOVE = 170; // px/s
const JUMP = 480; // px/s
const GROUND_Y = 170;

const PLATFORMS = [
  { x: 26, y: 124, w: 86, h: 9 },
  { x: 150, y: 88, w: 78, h: 9 },
  { x: 238, y: 126, w: 58, h: 9 },
];

const COINS = [
  { cx: 92, cy: 146 }, // on the ground walk-path — first catch is a guaranteed wow
  { cx: 178, cy: 76 },
  { cx: 262, cy: 112 },
];

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
}

const START: Player = { x: 40, y: 130, vx: 0, vy: 0, facing: 1 }; // ground spawn: first walk catches coin 1

type PreviewCanvasProps = {
  status: EngineStatus;
  onScore: (score: number) => void;
  className?: string;
};

export function PreviewCanvas({ status, onScore, className }: PreviewCanvasProps) {
  const [player, setPlayer] = useState<Player>(START);
  const [collected, setCollected] = useState<boolean[]>([false, false, false]);
  const [cleared, setCleared] = useState(false);
  const keys = useRef({ left: false, right: false });
  const stateRef = useRef({ player: START, collected: [false, false, false] as boolean[] });
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const scoreRef = useRef(0);

  const score = collected.filter(Boolean).length;

  const reset = () => {
    stateRef.current = { player: { ...START }, collected: [false, false, false] };
    setPlayer({ ...START });
    setCollected([false, false, false]);
    setCleared(false);
    scoreRef.current = 0;
    onScore(0);
  };

  useEffect(() => {
    if (status === "stopped" || status === "ready") reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Physics loop (rAF while running).
  useEffect(() => {
    if (status !== "running" || cleared) return;
    lastRef.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      const s = stateRef.current;
      const p = s.player;

      p.vx = (keys.current.left ? -MOVE : 0) + (keys.current.right ? MOVE : 0);
      if (p.vx !== 0) p.facing = p.vx > 0 ? 1 : -1;
      p.vy += GRAVITY * dt;

      p.x = Math.max(0, Math.min(300, p.x + p.vx * dt));

      // Vertical: integrate, then resolve ground/platform landings.
      p.y += p.vy * dt;
      const feet = p.y + 20;
      const onGround = feet >= GROUND_Y && p.vy >= 0;
      if (onGround) {
        p.y = GROUND_Y - 20;
        p.vy = 0;
      }
      for (const platform of PLATFORMS) {
        const withinX = p.x + 16 > platform.x && p.x + 4 < platform.x + platform.w;
        const landing = p.vy >= 0 && feet >= platform.y && feet <= platform.y + platform.h + 8 && p.y + 20 - p.vy * dt <= platform.y + 2;
        if (withinX && landing) {
          p.y = platform.y - 20;
          p.vy = 0;
        }
      }
      if (p.y > 220) {
        p.y = -20; // fell out — respawn at the top like a forgiving platformer
        p.vy = 0;
      }

      // Coin pickup.
      s.collected = s.collected.map((done, index) => {
        if (done) return true;
        const coin = COINS[index];
        if (!coin) return true;
        const hit = Math.abs(p.x + 10 - coin.cx) < 15 && Math.abs(p.y + 10 - coin.cy) < 15;
        if (hit) {
          scoreRef.current += 1;
          onScore(scoreRef.current);
          if (scoreRef.current === COINS.length) setCleared(true);
        }
        return done || hit;
      });
      setCollected([...s.collected]);
      setPlayer({ ...p });

      if (!cleared) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, cleared, onScore]);

  // Keyboard: captured only while running (and not cleared) so page scroll
  // is never hijacked when the demo is idle.
  useEffect(() => {
    if (status !== "running" || cleared) return;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "a"].includes(key)) { keys.current.left = true; event.preventDefault(); }
      if (["arrowright", "d"].includes(key)) { keys.current.right = true; event.preventDefault(); }
      if (["arrowup", "w", " "].includes(key)) {
        event.preventDefault();
        if (stateRef.current.player.vy === 0) stateRef.current.player.vy = -JUMP;
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "a"].includes(key)) keys.current.left = false;
      if (["arrowright", "d"].includes(key)) keys.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current = { left: false, right: false };
    };
  }, [status, cleared]);

  const jump = () => {
    if (status === "running" && stateRef.current.player.vy === 0) stateRef.current.player.vy = -JUMP;
  };
  const hold = (side: "left" | "right", down: boolean) => {
    keys.current[side] = down;
  };

  const running = status === "running" && !cleared;

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col p-3", className)}>
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
          Preview · main
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase",
            cleared ? "text-mint" : running ? "text-mint" : status === "paused" ? "text-amber" : status === "stopped" ? "text-rose" : "text-mist",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", cleared || running ? "bg-mint" : status === "paused" ? "bg-amber" : status === "stopped" ? "bg-rose" : "bg-mist", running && "anim-pulse-dot")}
          />
          {cleared ? "Cleared!" : running ? "Running" : status === "paused" ? "Paused" : status === "stopped" ? "Stopped" : "Ready"}
        </span>
      </div>

        <div className="flex justify-center">
        <DeviceFrame kind="phone">
        <svg
          viewBox="0 0 320 200"
          className="block w-full rounded-[14px]"
          role="img"
          aria-label={`Playable platformer preview: move with arrow keys, collect three coins. Score ${score} of ${COINS.length}.`}
        >
          <defs>
            <pattern id="demo-grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="0.8" fill="rgb(231 234 246 / 0.05)" />
            </pattern>
          </defs>

          <rect width="320" height="200" fill="#0c0f17" />
          <rect width="320" height="200" fill="url(#demo-grid)" />

          {/* ground */}
          <rect x="0" y={GROUND_Y} width="320" height="30" fill="#151b29" />
          <rect x="0" y={GROUND_Y} width="320" height="2" fill="#232c40" />

          {/* platforms */}
          {PLATFORMS.map((p) => (
            <g key={p.x}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill="#1b2130" />
              <rect x={p.x} y={p.y} width={p.w} height="2.5" rx="1.25" fill="#2a3348" />
            </g>
          ))}

          {/* coins (disappear when collected) */}
          {COINS.map((coin, index) =>
            collected[index] ? null : (
              <g key={index}>
                <circle cx={coin.cx} cy={coin.cy} r="5" fill="var(--color-amber)" />
                <circle cx={coin.cx} cy={coin.cy} r="2" fill="rgb(10 12 18 / 0.35)" />
              </g>
            ),
          )}

          {/* character — real position, eyes face the movement direction */}
          <g>
            <rect x={player.x} y={player.y} width="20" height="20" rx="5" fill="var(--color-mint)" />
            {player.facing === 1 ? (
              <>
                <rect x={player.x + 9} y={player.y + 4} width="6" height="7" rx="3" fill="rgb(10 12 18 / 0.85)" />
                <rect x={player.x + 3} y={player.y + 4} width="5" height="7" rx="2.5" fill="rgb(10 12 18 / 0.55)" />
              </>
            ) : (
              <>
                <rect x={player.x + 5} y={player.y + 4} width="6" height="7" rx="3" fill="rgb(10 12 18 / 0.85)" />
                <rect x={player.x + 12} y={player.y + 4} width="5" height="7" rx="2.5" fill="rgb(10 12 18 / 0.55)" />
              </>
            )}
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
          {cleared ? (
            <text
              x="160"
              y="60"
              textAnchor="middle"
              fill="var(--color-mint)"
              fontFamily="var(--font-mono)"
              fontSize="16"
              letterSpacing="3"
            >
              CLEAR!
            </text>
          ) : null}
        </svg>
        </DeviceFrame>
        </div>

      {/* Touch controls (also usable with a mouse) */}
      <div className="mt-2 flex items-center justify-center gap-2">
        <TouchButton
          label="Move left"
          onDown={() => hold("left", true)}
          onUp={() => hold("left", false)}
        >
          ◀
        </TouchButton>
        <TouchButton label="Jump" onDown={jump} onUp={() => {}}>
          ⤒
        </TouchButton>
        <TouchButton
          label="Move right"
          onDown={() => hold("right", true)}
          onUp={() => hold("right", false)}
        >
          ▶
        </TouchButton>
        <span className="ml-2 hidden font-mono text-[10px] text-mist sm:block">
          ←/→ move · ↑ jump
        </span>
      </div>
    </div>
  );
}

function TouchButton({
  label,
  onDown,
  onUp,
  children,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      className="flex h-9 w-12 select-none items-center justify-center rounded-lg border border-line bg-surface text-[13px] text-fog transition-colors active:bg-surface-strong active:text-ink"
    >
      {children}
    </button>
  );
}
