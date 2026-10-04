"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectModelComponent,
  ProjectModelScreen,
  PropsMap,
} from "@/types/project";
import type { ScreenRuntime } from "@/lib/project-model/runtime";
import {
  ambientOf,
  cameraApproachFactor,
  cameraConfig,
  cameraOf,
  clampCamera,
  cellColorFor,
  clipCompleted,
  clipFrameIndex,
  activeAnimation,
  evaluateAnimatorTransitions,
  lightsOf,
  LIGHT_LIMITS,
  parseAnimator,
  entityCollidable,
  entityIsTrigger,
  entityRect,
  entityVisible,
  entitiesOf,
  inputActionsOf,
  inputKeyIndex,
  parseAnimations,
  parseTiles,
  PLAYER_ACTION_JUMP,
  PLAYER_ACTION_LEFT,
  PLAYER_ACTION_RIGHT,
  rectsOverlap,
  sortedRenderOrder,
  spriteTransformStyle,
  tilemapSolidCellRects,
  tilemapCellSize,
  touchEventFor,
  type AnimClip,
  type AnimatorMachine,
  type EntityRect,
} from "@/lib/project-model/scene";
import { parseEmitter, ParticleSim } from "@/lib/project-model/particles";
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
const SHAKE_FREQUENCY = 38; // Hz — how fast the shake oscillates

/** Per-entity physics configuration (SYSTEM 3 — 2D physics abstraction). */
interface EntityPhys {
  bodyType: "dynamic" | "static" | "kinematic";
  gravityScale: number;
  bounciness: number;
  friction: number;
}

function entityPhys(props: PropsMap): EntityPhys {
  const num = (v: unknown, lo: number, hi: number, f: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : f;
  const raw = typeof props.bodyType === "string" ? props.bodyType : "";
  return {
    bodyType: raw === "static" || raw === "kinematic" ? raw : "dynamic",
    gravityScale: num(props.gravityScale, -4, 4, 1),
    bounciness: num(props.bounciness, 0, 1, 0),
    friction: num(props.friction, 0, 1, 0),
  };
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  /** 2D physics material (SYSTEM 3): seeded from the player's model props. */
  gravityScale: number;
  bounciness: number;
  friction: number;
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

/** Bounded shake envelope state. */
interface CameraState {
  x: number;
  y: number;
  /** Remaining / total shake time and the amplitude (px). */
  shakeLeft: number;
  shakeTotal: number;
  shakeStrength: number;
  /** Oscillation phase — sine-based so the offset is bounded and NaN-free. */
  phase: number;
  /** This frame's shake offset (render reads it; 0 when idle). */
  shiftX: number;
  shiftY: number;
}

export function SceneStage({ screen, runtime, emit, onRestart, onTrace, width, height }: SceneStageProps) {
  const [, setTick] = useState(0);
  /** Input abstraction: action id → pressed (held) state; `justPressed` holds
   * the down-edges consumed exactly once per tick. The key→actions index is
   * rebuilt from the screen's action set; OS key repeat can never re-trigger
   * a just-pressed edge because a repeat keydown sees pressed already true. */
  const inputRef = useRef<{ pressed: Map<string, boolean>; justPressed: Set<string> }>({
    pressed: new Map(),
    justPressed: new Set(),
  });
  const playerRef = useRef<PlayerState | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const touchingRef = useRef<Set<string>>(new Set());
  const spawnRef = useRef<{ x: number; y: number }>({ x: 24, y: 24 });
  const camRef = useRef<CameraState | null>(null);
  const missingTargetWarned = useRef<Set<string>>(new Set());
  const missingMovementWarned = useRef(false);
  /** Sprite animation playback state (SLICE 2) — runtime-local, never the
   * model: componentId → { active clip, elapsed seconds, paused, completed }.
   * SLICE 3: `machine` (parsed once per run) drives the clip from the entity's
   * state machine; parameter values and the current state are runtime state. */
  const animRef = useRef<Map<string, {
    clip: AnimClip;
    elapsed: number;
    paused: boolean;
    done: boolean;
    machine?: {
      def: AnimatorMachine;
      values: Map<string, boolean | number>;
      currentId: string;
      speed: number;
    };
  }>>(new Map());
  /** Particle sims (SYSTEM 18) — runtime instances, never the model. */
  const emitterRef = useRef<{ id: string; sim: ParticleSim; config: ReturnType<typeof parseEmitter>; cx: number; cy: number }[]>([]);
  const particlesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // The screen's action set (explicit or the default set) and its device-key
  // index — one source of truth shared with the editor and the export engine.
  const input = useMemo(() => {
    const actions = inputActionsOf(screen);
    return {
      actions,
      keyIndex: inputKeyIndex(actions),
      hasMovementActions: actions.some((a) => a.id === PLAYER_ACTION_LEFT && a.enabled) &&
        actions.some((a) => a.id === PLAYER_ACTION_RIGHT && a.enabled),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebinds arrive as a new array on the screen object
  }, [screen.inputActions]);

  /** On-screen controls enter through the SAME action layer as keys — the
   * game loop cannot tell a tap from a keydown (input abstraction §5.4). */
  const setAction = (id: string, down: boolean) => {
    const was = inputRef.current.pressed.get(id) === true;
    inputRef.current.pressed.set(id, down);
    if (down && !was) inputRef.current.justPressed.add(id);
  };

  /** The texture an animated entity renders THIS tick: its clip's current
   * frame, falling back to the entity's own src (missing frame assets render
   * the entity's static texture — never a broken image, never invented data). */
  const frameSrcFor = (componentId: string, props: PropsMap): string | null => {
    const state = animRef.current.get(componentId);
    if (!state || state.clip.frames.length === 0) return null;
    const index = state.done
      ? state.clip.frames.length - 1
      : clipFrameIndex(state.clip, state.elapsed);
    const frame = state.clip.frames[Math.min(index, state.clip.frames.length - 1)];
    return frame ?? (typeof props.src === "string" ? props.src : null);
  };

  const entities = entitiesOf(screen);
  // TASK 15: one deterministic render-order pipeline (layer → order → model
  // index), computed when the SCREEN changes — never per frame — and shared
  // with the design canvas and the export engine.
  const sortedComponents = useMemo(() => sortedRenderOrder(screen), [screen]);
  const playerComponent = entities.find((e) => e.type === "player");
  const cameraComponent = cameraOf(screen);
  // The camera frames the world; it never collides or fires touch events.
  const others = entities.filter((e) => e.id !== playerComponent?.id && e.type !== "camera");

  const liveProps = (id: string): PropsMap =>
    runtime?.getComponentProps(id) ?? screen.components.find((c) => c.id === id)?.props ?? {};

  // Seed the player from the model once per run (the parent remounts this
  // stage on restart, so a fresh run always starts from the model state).
  useEffect(() => {
    if (!playerComponent) {
      playerRef.current = null;
    } else {
      const rect = entityRect(liveProps(playerComponent.id), "player");
      const phys = entityPhys(liveProps(playerComponent.id));
      playerRef.current = { x: rect.x, y: rect.y, vx: 0, vy: 0, facing: 1, grounded: false, gravityScale: phys.gravityScale, bounciness: phys.bounciness, friction: phys.friction };
      spawnRef.current = { x: rect.x, y: rect.y };
      touchingRef.current = new Set();
      onTrace(`run start · player "${componentLabel(playerComponent)}" at (${rect.x}, ${rect.y}) · ${entities.length} entities`);
    }
    // Seed animation playback (SLICE 2): the entity's active clip plays from
    // frame 0 when the run starts. Playback state is runtime-local. SLICE 3:
    // an `animator` machine takes over — the default state's clip plays and
    // the machine drives every switch.
    animRef.current = new Map();
    for (const entity of entities) {
      const props = liveProps(entity.id);
      const clip = activeAnimation(props);
      if (!clip) continue;
      const animator = parseAnimator(props.animator);
      const machine = animator
        ? {
            def: animator,
            values: new Map<string, boolean | number>(
              animator.params.map((p) => [
                p.name,
                p.type === "bool" ? p.initial === "1" || p.initial === "true" : p.type === "number" ? Number(p.initial) || 0 : false,
              ]),
            ),
            currentId: animator.defaultId,
            speed: animator.states.find((s) => s.id === animator.defaultId)?.speed ?? 1,
          }
        : undefined;
      const startClip = machine
        ? parseAnimations(props.animations).find((c) => c.id === animator!.states.find((s) => s.id === machine.currentId)!.clip) ?? clip
        : clip;
      animRef.current.set(entity.id, { clip: startClip, elapsed: 0, paused: false, done: false, machine });
    }
    // Seed particle emitters (SYSTEM 18): one bounded sim per emitter.
    emitterRef.current = entities
      .filter((e) => e.type === "emitter")
      .map((e) => {
        const config = parseEmitter(liveProps(e.id));
        const rect = entityRect(liveProps(e.id), "emitter");
        return { id: e.id, sim: new ParticleSim(config.maxParticles), config, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
      });
    // The camera snaps to its initial framing — never eases from (0,0).
    if (cameraComponent) {
      const cfg = cameraConfig(liveProps(cameraComponent.id));
      const targetId = cfg.followEnabled ? cfg.followTarget : "";
      const target = targetId ? entities.find((e) => e.id === targetId && e.type !== "camera") : undefined;
      const own = entityRect(liveProps(cameraComponent.id), "camera");
      let x = own.x;
      let y = own.y;
      if (target) {
        const rect = entityRect(liveProps(target.id), target.type);
        x = rect.x + rect.width / 2 - width / 2;
        y = rect.y + rect.height / 2 - height / 2;
      }
      const clamped = clampCamera(x, y, { ...cfg, viewport: { width, height } });
      camRef.current = { x: clamped.x, y: clamped.y, shakeLeft: 0, shakeTotal: 0, shakeStrength: 0, phase: 0, shiftX: 0, shiftY: 0 };
      onTrace(`camera ready · follow ${target ? componentLabel(target) : "off"} · smoothing ${cfg.smoothing} · bounds ${cfg.boundsEnabled ? "on" : "off"}`);
    }
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per run (stage is remounted on restart)
  }, []);

  const traceRef = useRef(onTrace);
  traceRef.current = onTrace;

  // ---- physics loop -----------------------------------------------------------
  useEffect(() => {
    if (!playerComponent) return;
    lastRef.current = performance.now();

    /** World extents this frame: the camera's bounds when enabled, else the
     * viewport itself (pre-camera scenes behave exactly as before). */
    const worldOf = () => {
      const cfg = cameraComponent ? cameraConfig(liveProps(cameraComponent.id)) : null;
      if (cfg?.boundsEnabled) {
        return { minX: cfg.minX, maxX: cfg.maxX, minY: cfg.minY, maxY: cfg.maxY, enabled: true };
      }
      return { minX: 0, maxX: width, minY: 0, maxY: height, enabled: false };
    };

    /** Advance the runtime camera one frame: follow → smooth → clamp → shake.
     * Returns the shake offset applied this frame (0,0 when idle). */
    const updateCamera = (dt: number): { sx: number; sy: number } => {
      const cam = camRef.current;
      if (!cameraComponent || !cam) return { sx: 0, sy: 0 };

      // Block commands (shake) drain once per frame — runtime-local only.
      const commands = runtime?.cameraCommands ?? [];
      while (commands.length > 0) {
        const command = commands.shift();
        if (!command || command.kind !== "shake") continue;
        cam.shakeTotal = Math.max(0.05, Number.isFinite(command.duration) ? command.duration : 0.25);
        cam.shakeLeft = cam.shakeTotal;
        cam.shakeStrength = Math.max(0, Number.isFinite(command.strength) ? command.strength : 8);
        traceRef.current(`camera shake: ${cam.shakeStrength}px for ${cam.shakeTotal}s`);
      }

      const cfg = cameraConfig(liveProps(cameraComponent.id));
      let desiredX: number;
      let desiredY: number;
      const targetId = cfg.followEnabled ? cfg.followTarget : "";
      const target = targetId ? entities.find((e) => e.id === targetId && e.type !== "camera") : undefined;
      if (target) {
        const rect =
          target.id === playerComponent.id && playerRef.current
            ? playerDim(playerRef.current)
            : entityRect(liveProps(target.id), target.type);
        desiredX = rect.x + rect.width / 2 - width / 2;
        desiredY = rect.y + rect.height / 2 - height / 2;
      } else {
        if (targetId && !missingTargetWarned.current.has(targetId)) {
          // Fail graceful: hold position, say so once — never crash, never
          // reference a nonexistent entity silently.
          missingTargetWarned.current.add(targetId);
          traceRef.current(`camera target "${targetId}" no longer exists — holding position`);
        }
        const own = entityRect(liveProps(cameraComponent.id), "camera");
        desiredX = own.x;
        desiredY = own.y;
      }

      // Deterministic exponential approach (frame-rate independent).
      const alpha = cameraApproachFactor(cfg.smoothing, dt);
      cam.x += (desiredX - cam.x) * alpha;
      cam.y += (desiredY - cam.y) * alpha;
      const clamped = clampCamera(cam.x, cam.y, { ...cfg, viewport: { width, height } });
      cam.x = clamped.x;
      cam.y = clamped.y;
      // TASK 62 §23: pixel-safe mode — the eased camera ROUNDS to whole
      // pixels before rendering (deterministic, no subpixel jitter; the
      // smooth follow still eases underneath). Presentation-only: authored
      // coordinates are never mutated.
      if (cfg.pixelSnap) {
        cam.x = Math.round(cam.x);
        cam.y = Math.round(cam.y);
      }

      // Bounded shake: a sine envelope that decays to exactly zero — repeated
      // shakes restart the envelope, they never accumulate offsets.
      if (cam.shakeLeft > 0) {
        cam.shakeLeft = Math.max(0, cam.shakeLeft - dt);
        cam.phase += dt * SHAKE_FREQUENCY * Math.PI * 2;
        const envelope = cam.shakeTotal > 0 ? cam.shakeLeft / cam.shakeTotal : 0;
        cam.shiftX = cam.shakeStrength * envelope * Math.sin(cam.phase);
        cam.shiftY = cam.shakeStrength * envelope * Math.cos(cam.phase * 1.31);
        if (cam.shakeLeft === 0) {
          cam.shiftX = 0;
          cam.shiftY = 0;
          cam.phase = 0;
        }
      } else {
        cam.shiftX = 0;
        cam.shiftY = 0;
      }
      return { sx: cam.shiftX, sy: cam.shiftY };
    };

    const step = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      const player = playerRef.current;
      if (player) {
        // ACTION EVENTS (input abstraction): each just-pressed edge dispatches
        // its `action-pressed-*` event to matching block handlers — model
        // order, exactly one dispatch per edge, the same edge the built-in
        // jump consumes below. Script dispatch runs before physics (§tick).
        for (const action of input.actions) {
          if (inputRef.current.justPressed.has(action.id)) {
            runtime?.dispatchActionPressed(action.id);
          }
        }

        // INPUT (input abstraction): horizontal velocity comes from action
        // state, never from raw keys — the binding list is the only place a
        // device appears.
        const held = (id: string) => inputRef.current.pressed.get(id) === true;
        player.vx = (held(PLAYER_ACTION_LEFT) ? -MOVE : 0) + (held(PLAYER_ACTION_RIGHT) ? MOVE : 0);
        if (player.vx !== 0) player.facing = player.vx > 0 ? 1 : -1;

        // JUMP consumes the just-pressed edge inside the tick: deterministic,
        // exactly once per press, ordered with the physics integration.
        if (inputRef.current.justPressed.has(PLAYER_ACTION_JUMP)) {
          traceRef.current("input: Jump pressed");
          if (player.grounded) {
            player.vy = -JUMP;
            player.grounded = false;
          }
        }
        if (!input.hasMovementActions && !missingMovementWarned.current) {
          missingMovementWarned.current = true;
          traceRef.current("input actions: this screen's action set is missing move-left/move-right — the built-in player controls will not respond");
        }

        // PHYSICS (SYSTEM 3): gravity scale + grounded friction damping.
        player.vy += GRAVITY * player.gravityScale * dt;
        if (player.grounded && player.vx !== 0 && !held(PLAYER_ACTION_LEFT) && !held(PLAYER_ACTION_RIGHT)) {
          // No input this frame: friction bleeds residual horizontal speed.
          const drop = player.friction * 12 * dt;
          player.vx = Math.abs(player.vx) <= drop ? 0 : player.vx - Math.sign(player.vx) * drop;
        }

        // MOVEMENT: integrate. With camera bounds the world is the bounds —
        // the player may walk to the world edge, not the viewport edge.
        const world = worldOf();
        player.x = Math.max(world.minX, Math.min(world.maxX - playerDim(player).width, player.x + player.vx * dt));
        player.y += player.vy * dt;
        player.grounded = false;

        // COLLISION (solid): land on top surfaces of non-trigger collidables.
        // A tilemap contributes one SOLID rect per painted cell (TASK 62 §20:
        // "pass" palette tiles are decoration — they render, never collide);
        // an empty cell never is.
        const body = playerDim(player);
        for (const entity of others) {
          const props = liveProps(entity.id);
          if (!entityVisible(props) || !entityCollidable(props, entity.type)) continue;
          if (entityIsTrigger(entity.type, props)) continue;
          const rect = entityRect(props, entity.type);
          const solids = entity.type === "tilemap" ? tilemapSolidCellRects(props, rect) : [rect];
          for (const solid of solids) {
            const withinX = body.x + body.width > solid.x + 2 && body.x < solid.x + solid.width - 2;
            const feet = body.y + body.height;
            const landing =
              player.vy >= 0 &&
              feet >= solid.y &&
              feet <= solid.y + solid.height + 10 &&
              feet - player.vy * dt <= solid.y + 4;
            if (withinX && landing) {
              player.y = solid.y - body.height;
              // PHYSICS MATERIAL: bounciness reflects impact velocity.
              const impact = Math.abs(player.vy);
              player.vy = player.bounciness > 0 && impact > 120 ? -impact * player.bounciness : 0;
              player.grounded = player.vy === 0;
            }
          }
        }

        // World floor + ceiling + respawn safety net.
        const floorY = world.enabled ? world.maxY : height;
        if (body.y + body.height >= floorY) {
          const impact = Math.abs(player.vy);
          player.y = floorY - body.height;
          player.vy = player.bounciness > 0 && impact > 120 ? -impact * player.bounciness : 0;
          player.grounded = player.vy === 0;
        }
        if (player.y < -60) {
          player.y = -60;
          player.vy = 0;
        }
        if (player.y > floorY + 120) {
          player.x = spawnRef.current.x;
          player.y = spawnRef.current.y;
          player.vy = 0;
          touchingRef.current = new Set();
          traceRef.current("player fell out of the stage — respawned at the start point");
        }

        // COLLISION EVENTS (SYSTEM 3): enter / stay (2 Hz, not every frame) /
        // exit — all dispatched into the block runtime. Tilemap overlap is
        // per SOLID painted cell, matching the collision solids (non-solid
        // "pass" decoration never fires touch events either).
        const stillTouching = new Set<string>();
        for (const entity of others) {
          const props = liveProps(entity.id);
          if (!entityVisible(props) || !entityCollidable(props, entity.type)) continue;
          const rect = entityRect(props, entity.type);
          const touchRects = entity.type === "tilemap" ? tilemapSolidCellRects(props, rect) : [rect];
          if (touchRects.some((touchRect) => rectsOverlap(body, touchRect))) {
            stillTouching.add(entity.id);
            if (!touchingRef.current.has(entity.id)) {
              traceRef.current(
                `collision enter: player ↔ ${componentLabel(entity)} (${entity.type}) — firing ${touchEventFor(entity.id)}`,
              );
              emit(playerComponent.id, touchEventFor(entity.id));
            } else if (Math.floor(now / 500) !== Math.floor((now - 16) / 500)) {
              // Stay: throttled to ~2 Hz so a stay handler can't flood blocks.
              emit(playerComponent.id, `touching-${entity.id}`);
            }
          } else if (touchingRef.current.has(entity.id)) {
            traceRef.current(
              `collision exit: player ↔ ${componentLabel(entity)} (${entity.type}) — firing touches-exit-${entity.id}`,
            );
            emit(playerComponent.id, `touches-exit-${entity.id}`);
          }
        }
        touchingRef.current = stillTouching;
      }

      // CAMERA: follow → smooth → clamp → shake, one pass per frame. The
      // camera never writes to the model and never re-renders on its own —
      // it rides this game loop's single tick.
      updateCamera(dt);

      // ANIMATION (SLICE 2): elapsed-time playback — frame index derives from
      // accumulated seconds × fps, so pacing is identical at any frame rate.
      // Non-looping clips clamp at the last frame and mark completed; they
      // never silently restart. Then drain block play/pause/restart/stop
      // commands (runtime state only — the model is untouched).
      for (const state of animRef.current.values()) {
        if (!state.paused && !state.done) {
          state.elapsed += dt * (state.machine?.speed ?? 1);
          if (clipCompleted(state.clip, state.elapsed)) state.done = true;
        }
      }
      while (runtime && runtime.animationCommands.length > 0) {
        const command = runtime.animationCommands.shift()!;
        const state = animRef.current.get(command.componentId);
        if (!state) continue;
        const clips = parseAnimations(liveProps(command.componentId).animations);
        if (command.op === "play") {
          state.clip = (command.clipId ? clips.find((c) => c.id === command.clipId) : undefined) ?? state.clip;
          state.elapsed = 0;
          state.paused = false;
          state.done = false;
        } else if (command.op === "pause") {
          state.paused = true;
        } else if (command.op === "restart") {
          state.elapsed = 0;
          state.paused = false;
          state.done = false;
        } else if (command.op === "stop") {
          state.elapsed = 0;
          state.paused = true;
          state.done = false;
        } else if ((command.op === "param" || command.op === "trigger") && command.name && state.machine) {
          // SLICE 3: state-machine parameter feeds (runtime values only).
          const def = state.machine.def.params.find((p) => p.name === command.name);
          if (def) {
            if (def.type === "trigger") state.machine.values.set(def.name, true);
            else if (def.type === "bool") state.machine.values.set(def.name, command.value === true || command.value === 1);
            else {
              const num = Number(command.value ?? 0);
              state.machine.values.set(def.name, Number.isFinite(num) ? num : 0);
            }
          }
        }
      }

      // STATE MACHINE (SLICE 3): read parameters → evaluate transitions
      // deterministically (explicit order, at most ONE switch per tick — no
      // same-tick chains) → drive the existing animation player. Built-in
      // parameters are fed from the player's actual physics; triggers reset
      // after each pass (edge semantics — fire once).
      for (const [componentId, state] of animRef.current) {
        const machine = state.machine;
        if (!machine) continue;
        const isPlayerEntity = componentId === playerComponent?.id;
        // Built-in parameters are always fed from actual physics — a
        // machine can condition on them without declaring anything.
        machine.values.set("speed", isPlayerEntity && player ? Math.abs(player.vx) : 0);
        machine.values.set("isGrounded", isPlayerEntity && player ? player.grounded : true);
        const total = state.clip.frames.length / Math.max(1, state.clip.fps);
        const rawProgress = total > 0 ? state.elapsed / total : 1;
        const progress = state.clip.loop && rawProgress >= 1 ? rawProgress % 1 : Math.min(rawProgress, 1);
        const taken = evaluateAnimatorTransitions(machine.def, machine.values, machine.currentId, progress);
        if (taken) {
          const target = machine.def.states.find((s) => s.id === taken.to);
          if (target) {
            machine.currentId = target.id;
            machine.speed = target.speed;
            const targetClip = parseAnimations(liveProps(componentId).animations).find((c) => c.id === target.clip);
            if (targetClip && targetClip.id !== state.clip.id) {
              // State switch drives the existing player: new clip, frame 0.
              state.clip = targetClip;
              state.elapsed = 0;
              state.done = false;
              state.paused = false;
            }
          }
        }
        for (const param of machine.def.params) {
          if (param.type === "trigger") machine.values.set(param.name, false);
        }
      }

      // PARTICLES (SYSTEM 18): drain burst requests, advance every emitter's
      // bounded sim by dt, then draw the alive particles onto the world-
      // anchored canvas (emissive — drawn above the lighting layer).
      while (runtime && runtime.particleCommands.length > 0) {
        const command = runtime.particleCommands.shift()!;
        const emitter = emitterRef.current.find((e) => e.id === command.componentId);
        emitter?.sim.burst(emitter.config, emitter.cx, emitter.cy, command.count);
      }
      let alive = 0;
      for (const emitter of emitterRef.current) {
        emitter.sim.step(emitter.config, dt, emitter.cx, emitter.cy);
        alive += emitter.sim.count;
      }
      const canvas = particlesCanvasRef.current;
      if (canvas) {
        canvas.dataset.particleCount = String(alive);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const camNow = camRef.current;
          const shiftX = camNow ? camNow.x - camNow.shiftX : 0;
          const shiftY = camNow ? camNow.y - camNow.shiftY : 0;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const emitter of emitterRef.current) {
            for (const particle of emitter.sim.particles) {
              const { size, opacity } = ParticleSim.frame(particle);
              if (size <= 0 || opacity <= 0) continue;
              ctx.globalAlpha = opacity;
              ctx.fillStyle = particle.color;
              ctx.beginPath();
              ctx.arc(particle.x - shiftX, particle.y - shiftY, Math.max(0.5, size / 2), 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      }

      // The just-pressed edges were consumed by this tick — clear them so a
      // single press can never fire twice.
      inputRef.current.justPressed.clear();

      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loop reads live runtime state; entities list is stable per run
  }, []);

  // ---- input ------------------------------------------------------------------
  // Device listeners translate keys into ACTION state; the game loop above is
  // the only consumer. Editor input never reaches here (the stage mounts only
  // while a run is live).
  useEffect(() => {
    const handle = (event: KeyboardEvent, isDown: boolean) => {
      const actionIds = input.keyIndex.get(event.key.toLowerCase());
      if (!actionIds) return;
      event.preventDefault();
      for (const id of actionIds) {
        const was = inputRef.current.pressed.get(id) === true;
        inputRef.current.pressed.set(id, isDown);
        if (isDown && !was) inputRef.current.justPressed.add(id);
      }
    };
    const down = (event: KeyboardEvent) => handle(event, true);
    const up = (event: KeyboardEvent) => handle(event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      inputRef.current.pressed = new Map();
      inputRef.current.justPressed = new Set();
    };
  }, [input]);

  // ---- render -----------------------------------------------------------------
  const player = playerRef.current;
  const playerBody = player ? playerDim(player) : null;
  const cam = camRef.current;
  // The world translates by the camera; shake rides the same transform. The
  // camera is runtime-local: no model write, no extra render pass.
  const camShiftX = cam ? cam.x - cam.shiftX : 0;
  const camShiftY = cam ? cam.y - cam.shiftY : 0;
  const worldShift = cam
    ? `translate(${Math.round(-camShiftX * 100) / 100}px, ${Math.round(-camShiftY * 100) / 100}px)`
    : undefined;

  // LIGHTING (SYSTEM 5): one world-anchored compositing pass — an ambient
  // darkness veil plus one screen-blended radial gradient per enabled point
  // light. Because the layer is a child of the camera-translated world
  // container and offset by the camera origin, lights stay attached to world
  // objects while covering exactly the visible region. Derived per frame
  // from configuration (clamped) — deterministic, bounded (≤ 8 lights),
  // runtime state only.
  const ambient = ambientOf(screen.styles);
  const lights = lightsOf(screen, (props) => entityRect(props, "light"));
  const showLighting = lights.some((l) => l.enabled && l.intensity > 0) || ambient.intensity < 1;

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", touchAction: "none" }}>
      <div
        data-camera-world="true"
        data-camera-x={cam ? Math.round(cam.x * 10) / 10 : undefined}
        data-camera-y={cam ? Math.round(cam.y * 10) / 10 : undefined}
        data-camera-shake={cam && cam.shiftX !== 0 ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          transform: worldShift,
          willChange: "transform",
        }}
      >
        {sortedComponents.map((component) => {
          const props = liveProps(component.id);
          if (!entityVisible(props)) return null;
          // The camera, lights, and emitters are configuration, not visible
          // objects (emitters render through the particle canvas).
          if (component.type === "camera" || component.type === "light" || component.type === "emitter") return null;
          if (component.id === playerComponent?.id && playerBody) {
            return <PlayerView key={component.id} id={component.id} rect={playerBody} facing={player?.facing ?? 1} color={typeof props.color === "string" ? props.color : "#46e3b4"} name={componentLabel(component)} frameSrc={frameSrcFor(component.id, props)} orientation={spriteTransformStyle(props)} />;
          }
          return <EntityView key={component.id} component={component} props={props} frameSrc={frameSrcFor(component.id, props)} />;
        })}
        {showLighting ? (
          <div
            data-light-layer="true"
            style={{
              position: "absolute",
              left: camShiftX,
              top: camShiftY,
              width,
              height,
              pointerEvents: "none",
              isolation: "isolate",
            }}
          >
            <div
              data-light-ambient="true"
              style={{
                position: "absolute",
                inset: 0,
                background: ambient.color,
                opacity: 1 - ambient.intensity,
              }}
            />
            {lights
              .filter((light) => light.enabled && light.intensity > 0)
              .map((light) => (
                <div
                  key={light.id}
                  data-light-point={light.id}
                  style={{
                    position: "absolute",
                    left: light.cx - light.radius - camShiftX,
                    top: light.cy - light.radius - camShiftY,
                    width: light.radius * 2,
                    height: light.radius * 2,
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${light.color} 0%, rgba(0,0,0,0) 72%)`,
                    opacity: Math.min(1, light.intensity),
                    mixBlendMode: "screen",
                  }}
                />
              ))}
          </div>
        ) : null}
        {/* SYSTEM 18: one bounded particle canvas for the whole scene —
            world-anchored (tracks the camera), drawn imperatively in the
            tick, emissive (above the lighting layer). */}
        <canvas
          ref={particlesCanvasRef}
          data-particle-canvas="true"
          width={width}
          height={height}
          style={{ position: "absolute", left: camShiftX, top: camShiftY, pointerEvents: "none" }}
        />
      </div>

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
          <StageButton label="Move left" onDown={() => setAction(PLAYER_ACTION_LEFT, true)} onUp={() => setAction(PLAYER_ACTION_LEFT, false)}>◀</StageButton>
          <StageButton label="Jump" onDown={() => setAction(PLAYER_ACTION_JUMP, true)} onUp={() => {}}>⤒</StageButton>
          <StageButton label="Move right" onDown={() => setAction(PLAYER_ACTION_RIGHT, true)} onUp={() => setAction(PLAYER_ACTION_RIGHT, false)}>▶</StageButton>
        </div>
      ) : null}
    </div>
  );
}

function playerDim(player: PlayerState): EntityRect {
  return { x: player.x, y: player.y, width: 36, height: 36 };
}



/** One scene entity as the model describes it (shape by type, color by prop). */
function EntityView({
  component,
  props,
  frameSrc,
}: {
  component: ProjectModelComponent;
  props: PropsMap;
  frameSrc?: string | null;
}) {
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
  // TASK 62 §10/§11: pivot + flip through the ONE canonical formula — the
  // same helper the design canvas and the export engine use. The pivot is
  // the rotation anchor and the fixed edge for flips; the asset never mutates.
  const orientation = spriteTransformStyle(props);
  const transform = [rotation ? `rotate(${rotation}deg)` : "", orientation.transform ?? ""]
    .filter(Boolean)
    .join(" ");
  const base: React.CSSProperties = {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    transform: transform || undefined,
    transformOrigin: orientation.transformOrigin,
    userSelect: "none",
  };
  // A texture (Asset Studio PNG or any URL) replaces the color shape —
  // this is how drawn sprites become real game graphics. An ANIMATED entity
  // renders its clip's current frame instead of the static src (SLICE 2).
  const texture = (frameSrc ?? (typeof props.src === "string" ? props.src.trim() : "")) || null;
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
    case "tilemap": {
      const cell = tilemapCellSize(props);
      const cells = parseTiles(String(props.tiles ?? ""));
      const painted = new Set(cells.map(({ col, row }) => `${col},${row}`));
      const isPainted = (c: number, r: number) => painted.has(`${c},${r}`);
      return (
        <div data-entity={component.id} title={componentLabel(component)} style={{ ...base }}>
          {cells.map(({ col, row, tile }, i) => (
            <div
              key={i}
              data-cell={`${col},${row}`}
              data-tile={tile}
              style={{ position: "absolute", left: col * cell, top: row * cell, width: cell, height: cell, background: cellColorFor(props, col, row, isPainted, tile), boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }}
            />
          ))}
        </div>
      );
    }
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

function PlayerView({ id, rect, facing, color, name, frameSrc, orientation }: { id: string; rect: EntityRect; facing: 1 | -1; color: string; name: string; frameSrc?: string | null; orientation?: { transform: string | undefined; transformOrigin: string } }) {
  // An animated player renders its state machine's current frame instead of
  // the color shape (SLICE 3) — same rendering as animated sprites. TASK 62:
  // canonical pivot/flip apply to the texture through the shared formula.
  if (frameSrc) {
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
          overflow: "hidden",
          borderRadius: 9,
          transform: orientation?.transform,
          transformOrigin: orientation?.transformOrigin,
          userSelect: "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- project asset or user URL */}
        <img
          src={imageUrl(frameSrc)}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "fill", imageRendering: "pixelated", pointerEvents: "none" }}
        />
      </div>
    );
  }
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

const ENTITY_SHAPES = new Set(["player", "platform", "coin", "enemy", "trigger", "sprite", "tilemap"]);

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
