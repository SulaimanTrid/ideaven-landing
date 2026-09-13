"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProjectModelComponent,
  ProjectModelScreen,
  PropsMap,
} from "@/types/project";
import type { ScreenRuntime } from "@/lib/project-model/runtime";
import {
  entityCollidable,
  entityIsTrigger,
  entityRect,
  entityVisible,
  entitiesOf,
  rectsOverlap,
  touchEventFor,
  type EntityRect,
} from "@/lib/project-model/scene";
import { getDef } from "@/lib/project-model/registry";
import { componentLabel } from "@/app/builder/[id]/builder/builder-context";
import { imageUrl } from "@/lib/api";

/**
 * The 2D scene runtime (TASK 08): a REAL game loop over the canonical model.
 * INPUT (keys + on-screen buttons) → PLAYER MOVEMENT (velocity, gravity,
 * platform landing) → COLLISION (AABB, edge-triggered) → EVENT (dynamic
 * `touches-<id>` dispatched into the block runtime) → LOGIC (the user's own
 * blocks — score, hide, navigate) → UI UPDATE (runtime props) → RENDER.
 *
 * Only the player moves; platforms are solid; trigger entities (coin/enemy/
 * trigger zones) fire events instead of blocking. Everything on screen is a
 * model component — nothing here is a hardcoded diorama.
 */

const GRAVITY = 1500; // px/s²
const MOVE = 190; // px/s
const JUMP = 520; // px/s

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
}

export interface SceneStageProps {
  screen: ProjectModelScreen;
  runtime: ScreenRuntime | null;
  emit: (componentId: string | null, event: string) => void;
  /** Restarts the run (used by the respawn safety net). */
  onRestart: () => void;
  onTrace: (line: string) => void;
  width: number;
  height: number;
}

export function SceneStage({ screen, runtime, emit, onRestart, onTrace, width, height }: SceneStageProps) {
  const [, setTick] = useState(0);
  const keys = useRef({ left: false, right: false });
  const playerRef = useRef<PlayerState | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const touchingRef = useRef<Set<string>>(new Set());
  const spawnRef = useRef<{ x: number; y: number }>({ x: 24, y: 24 });

  const entities = entitiesOf(screen);
  const playerComponent = entities.find((e) => e.type === "player");
  const others = entities.filter((e) => e.id !== playerComponent?.id);

  const liveProps = (id: string): PropsMap =>
    runtime?.getComponentProps(id) ?? screen.components.find((c) => c.id === id)?.props ?? {};

  // Seed the player from the model once per run (the parent remounts this
  // stage on restart, so a fresh run always starts from the model state).
  useEffect(() => {
    if (!playerComponent) {
      playerRef.current = null;
      return;
    }
    const rect = entityRect(liveProps(playerComponent.id), "player");
    playerRef.current = { x: rect.x, y: rect.y, vx: 0, vy: 0, facing: 1, grounded: false };
    spawnRef.current = { x: rect.x, y: rect.y };
    touchingRef.current = new Set();
    onTrace(`run start · player "${componentLabel(playerComponent)}" at (${rect.x}, ${rect.y}) · ${entities.length} entities`);
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per run (stage is remounted on restart)
  }, []);

  const traceRef = useRef(onTrace);
  traceRef.current = onTrace;

  // ---- physics loop -----------------------------------------------------------
  useEffect(() => {
    if (!playerComponent) return;
    lastRef.current = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      const player = playerRef.current;
      if (player) {
        // INPUT → horizontal velocity.
        player.vx = (keys.current.left ? -MOVE : 0) + (keys.current.right ? MOVE : 0);
        if (player.vx !== 0) player.facing = player.vx > 0 ? 1 : -1;

        // MOVEMENT: integrate, clamp to the stage.
        player.x = Math.max(0, Math.min(width - playerDim(player).width, player.x + player.vx * dt));
        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;
        player.grounded = false;

        // COLLISION (solid): land on top surfaces of non-trigger collidables.
        const body = playerDim(player);
        for (const entity of others) {
          const props = liveProps(entity.id);
          if (!entityVisible(props) || !entityCollidable(props)) continue;
          if (entityIsTrigger(entity.type, props)) continue;
          const rect = entityRect(props, entity.type);
          const withinX = body.x + body.width > rect.x + 2 && body.x < rect.x + rect.width - 2;
          const feet = body.y + body.height;
          const landing =
            player.vy >= 0 &&
            feet >= rect.y &&
            feet <= rect.y + rect.height + 10 &&
            feet - player.vy * dt <= rect.y + 4;
          if (withinX && landing) {
            player.y = rect.y - body.height;
            player.vy = 0;
            player.grounded = true;
          }
        }

        // Stage floor + ceiling + respawn safety net.
        if (body.y + body.height >= height) {
          player.y = height - body.height;
          player.vy = 0;
          player.grounded = true;
        }
        if (player.y < -60) {
          player.y = -60;
          player.vy = 0;
        }
        if (player.y > height + 120) {
          player.x = spawnRef.current.x;
          player.y = spawnRef.current.y;
          player.vy = 0;
          touchingRef.current = new Set();
          traceRef.current("player fell out of the stage — respawned at the start point");
        }

        // COLLISION (triggers): edge-triggered touch events into the blocks.
        const stillTouching = new Set<string>();
        for (const entity of others) {
          const props = liveProps(entity.id);
          if (!entityVisible(props) || !entityCollidable(props)) continue;
          const rect = entityRect(props, entity.type);
          if (rectsOverlap(body, rect)) {
            stillTouching.add(entity.id);
            if (!touchingRef.current.has(entity.id)) {
              traceRef.current(
                `collision: player ↔ ${componentLabel(entity)} (${entity.type}) — firing ${touchEventFor(entity.id)}`,
              );
              emit(playerComponent.id, touchEventFor(entity.id));
            }
          }
        }
        touchingRef.current = stillTouching;
      }

      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loop reads live runtime state; entities list is stable per run
  }, []);

  // ---- input ------------------------------------------------------------------
  const jump = useCallback(() => {
    const player = playerRef.current;
    if (player && player.grounded) {
      player.vy = -JUMP;
      player.grounded = false;
    }
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "a"].includes(key)) { keys.current.left = true; event.preventDefault(); }
      if (["arrowright", "d"].includes(key)) { keys.current.right = true; event.preventDefault(); }
      if (["arrowup", "w", " "].includes(key)) { event.preventDefault(); jump(); }
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
  }, [jump]);

  // ---- render -----------------------------------------------------------------
  const player = playerRef.current;
  const playerBody = player ? playerDim(player) : null;

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", touchAction: "none" }}>
      {screen.components.map((component) => {
        const props = liveProps(component.id);
        if (!entityVisible(props)) return null;
        if (component.id === playerComponent?.id && playerBody) {
          return <PlayerView key={component.id} id={component.id} rect={playerBody} facing={player?.facing ?? 1} color={typeof props.color === "string" ? props.color : "#46e3b4"} name={componentLabel(component)} />;
        }
        return <EntityView key={component.id} component={component} props={props} />;
      })}

      {/* On-screen controls (touch parity with the keyboard) */}
      {playerComponent ? (
        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            display: "flex",
            gap: 8,
            zIndex: 10,
          }}
        >
          <StageButton label="Move left" onDown={() => { keys.current.left = true; }} onUp={() => { keys.current.left = false; }}>◀</StageButton>
          <StageButton label="Jump" onDown={jump} onUp={() => {}}>⤒</StageButton>
          <StageButton label="Move right" onDown={() => { keys.current.right = true; }} onUp={() => { keys.current.right = false; }}>▶</StageButton>
        </div>
      ) : null}
    </div>
  );
}

function playerDim(player: PlayerState): EntityRect {
  return { x: player.x, y: player.y, width: 36, height: 36 };
}



/** One scene entity as the model describes it (shape by type, color by prop). */
function EntityView({ component, props }: { component: ProjectModelComponent; props: PropsMap }) {
  const def = getDef(component.type);
  if (!ENTITY_SHAPES.has(component.type)) {
    // Non-entity components on a scene screen (usually HUD text) position
    // from their props as well.
    const rect = entityRect(props, component.type);
    return (
      <div
        data-entity={component.id}
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          color: "#e8ecf6",
          fontSize: typeof props.fontSize === "number" ? props.fontSize : 20,
          fontWeight: 800,
          letterSpacing: 2,
          whiteSpace: "pre-wrap",
          userSelect: "none",
        }}
      >
        {String(props.text ?? "")}
      </div>
    );
  }
  const rect = entityRect(props, component.type);
  const color = typeof props.color === "string" ? props.color : "#58c7f0";
  const rotation = typeof props.rotation === "number" && Number.isFinite(props.rotation) ? props.rotation : 0;
  const base: React.CSSProperties = {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    userSelect: "none",
  };
  // A texture (Asset Studio PNG or any URL) replaces the color shape —
  // this is how drawn sprites become real game graphics.
  const texture = typeof props.src === "string" && props.src.trim() !== "" ? props.src.trim() : null;
  if (texture && component.type !== "text") {
    return (
      <div data-entity={component.id} title={componentLabel(component)} style={{ ...base, overflow: "hidden", borderRadius: 4 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- project asset or user URL */}
        <img
          src={imageUrl(texture)}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "fill", imageRendering: "pixelated", pointerEvents: "none" }}
        />
      </div>
    );
  }
  switch (component.type) {
    case "platform":
      return (
        <div
          data-entity={component.id}
          title={componentLabel(component)}
          style={{ ...base, background: color, borderRadius: 4, boxShadow: "inset 0 2px 0 rgb(255 255 255 / 0.12)" }}
        />
      );
    case "coin":
      return (
        <div data-entity={component.id} title={componentLabel(component)} style={base}>
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: color,
              boxShadow: "inset -3px -3px 0 rgb(0 0 0 / 0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgb(0 0 0 / 0.45)",
              fontWeight: 900,
              fontSize: Math.min(rect.width, rect.height) * 0.5,
            }}
          >
            ¢
          </div>
        </div>
      );
    case "enemy":
      return (
        <div
          data-entity={component.id}
          title={componentLabel(component)}
          style={{ ...base, background: color, borderRadius: 8, boxShadow: "inset -3px -3px 0 rgb(0 0 0 / 0.22)" }}
        >
          <div style={{ display: "flex", gap: "18%", padding: "22% 26% 0" }}>
            <Eye /><Eye />
          </div>
        </div>
      );
    case "trigger":
      return (
        <div
          data-entity={component.id}
          title={componentLabel(component)}
          style={{
            ...base,
            border: `2px dashed ${color}`,
            borderRadius: 8,
            background: `${color}22`,
          }}
        />
      );
    default:
      return (
        <div
          data-entity={component.id}
          title={componentLabel(component)}
          style={{ ...base, background: color, borderRadius: 6, opacity: 0.92 }}
        />
      );
  }
}

function PlayerView({ id, rect, facing, color, name }: { id: string; rect: EntityRect; facing: 1 | -1; color: string; name: string }) {
  return (
    <div
      data-entity={id}
      title={name}
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderRadius: 9,
        background: color,
        boxShadow: "inset -4px -4px 0 rgb(0 0 0 / 0.18)",
        userSelect: "none",
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", gap: 4, padding: "8px 8px 0", justifyContent: facing === 1 ? "flex-end" : "flex-start" }}>
        <Eye dark /><Eye dark />
      </div>
    </div>
  );
}

function Eye({ dark }: { dark?: boolean }) {
  return (
    <span
      style={{
        width: 6,
        height: 7,
        borderRadius: 3,
        background: dark ? "rgb(10 12 18 / 0.85)" : "rgb(10 12 18 / 0.6)",
        display: "inline-block",
      }}
    />
  );
}

const ENTITY_SHAPES = new Set(["player", "platform", "coin", "enemy", "trigger", "sprite"]);

function StageButton({
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
      style={{
        width: 44,
        height: 36,
        borderRadius: 10,
        border: "1px solid rgb(255 255 255 / 0.18)",
        background: "rgb(10 12 18 / 0.72)",
        color: "#e8ecf6",
        fontSize: 15,
        cursor: "pointer",
        touchAction: "none",
      }}
    >
      {children}
    </button>
  );
}
