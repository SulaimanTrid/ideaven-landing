"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectModel, ProjectModelComponent, ProjectModelScreen, PropsMap } from "@/types/project";
import {
  drawScene3D,
  drawColliderGizmos,
  drawLightGizmos,
  drawTransformGizmo,
  projectTransformGizmo,
  mat4Identity,
  mat4Invert,
  mat4TransformPoint,
  type Camera3DState,
  type Mesh3D,
  type GizmoHandleGeometry,
  type GizmoKind,
  type GizmoAxisName,
} from "@/lib/render3d";
import { computeWorldMatrices } from "@/lib/hierarchy3d";
import {
  parsePhysicsConfig,
  parseSceneGravity,
  PhysicsBodyState,
  PhysicsConfig,
  PhysicsWorld,
  PHYSICS_LIMITS,
} from "@/lib/physics3d";
import { parseAmbient3D, resolveLights3D } from "@/lib/lights3d";
import {
  cameraBasis,
  controllerVelocity,
  inputVector,
  parseController3D,
  resolveControllerKeys,
} from "@/lib/character3d";
import {
  aabbFromMatrix,
  angleDelta,
  axisRayParameter,
  GIZMO_SNAP_STEPS,
  gizmoAxes,
  planarAngle,
  planeBasis,
  raycastAABB,
  rayPlanePoint,
  rotationMatrix,
  scaleFromProjection,
  screenToWorldRay,
  snapToStep,
  worldCenterOf,
  type GizmoAxis,
  type GizmoSpace,
  type Vec3,
} from "@/lib/transform-gizmo";
/**
 * TASK 51: the 3D viewport — ONE renderer for the editor (orbit camera,
 * grid, click-select) and the runtime (the model's active camera3d, no
 * gizmos). Both read the SAME canonical components; the editor orbit is
 * local navigation state and never touches the model.
 */

const MESH_TYPES = new Set(["cube3d", "sphere3d", "plane3d"]);

/** The runtime camera: the active camera3d's authored configuration. */
function cameraOf3D(screen: ProjectModelScreen): Camera3DState {
  const camera = screen.components.find((c) => c.type === "camera3d" && c.props?.active === true)
    ?? screen.components.find((c) => c.type === "camera3d");
  const p = camera?.props ?? {};
  const num = (key: string, fallback: number) => {
    const v = Number(p[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    position: [num("px", 0), num("py", 2.2), num("pz", 6)],
    rotation: [num("rx", -20), num("ry", 0), 0],
    fov: num("fov", 60),
    near: num("near", 0.1),
    far: num("far", 2000),
  };
}

/** Builds one renderable mesh from a canonical 3D component. `props` is the
 * live props (runtime state overrides like block set-property) falling back
 * to the authored props. */
function meshOf(component: ProjectModelComponent, props: PropsMap): Mesh3D | null {
  if (!MESH_TYPES.has(component.type)) return null;
  const vec = (keys: [string, string, string], fallback: [number, number, number]): [number, number, number] => {
    const v = keys.map((k) => (typeof props[k] === "number" && Number.isFinite(props[k]) ? (props[k] as number) : NaN));
    return [
      Number.isFinite(v[0]) ? v[0]! : fallback[0],
      Number.isFinite(v[1]) ? v[1]! : fallback[1],
      Number.isFinite(v[2]) ? v[2]! : fallback[2],
    ];
  };
  return {
    id: component.id,
    kind: component.type.replace("3d", "") as Mesh3D["kind"],
    color: typeof props.color === "string" ? props.color : "#58c7f0",
    visible: props.visible !== false,
    position: vec(["px", "py", "pz"], [0, 0.5, 0]),
    rotation: vec(["rx", "ry", "rz"], [0, 0, 0]),
    scale: vec(["sx", "sy", "sz"], [1, 1, 1]),
  };
}

export interface Viewport3DProps {
  model: ProjectModel;
  screen: ProjectModelScreen;
  mode: "editor" | "runtime";
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** TASK 53: editor-only hierarchy operations (wired to canonical ops). */
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  /** TASK 60 §20: GROUP variants for the multi-select chip — the whole
   * selection is ONE pure model op / ONE undoable commit. Optional; without
   * them the chip falls back to per-entity calls. */
  onDeleteMany?: (ids: string[]) => void;
  onDuplicateMany?: (ids: string[]) => void;
  /** TASK 54: runtime physics - emit dispatches trigger events through the
   * existing handler architecture (runtime mode only). */
  runtimeEmit?: (componentId: string | null, event: string) => void;
  /** TASK 54: live component props (block set-property etc.) for rendering. */
  getProps?: (id: string) => PropsMap | undefined;
  /** TASK 56: editor-only gizmo commits — ONE canonical, undoable
   * updateProps per completed drag (wired to the builder's action pipeline).
   * Absent in runtime modes, where gizmos never render. */
  onTransform?: (id: string, patch: PropsMap) => void;
}

export function Viewport3D({ model, screen, mode, selectedId, onSelect, onDelete, onDuplicate, onDeleteMany, onDuplicateMany, runtimeEmit, getProps, onTransform }: Viewport3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Editor-only orbit navigation: yaw (rad), elevation (rad), distance, and
  // the look-at target (TASK 60 §22 — default matches the old implicit
  // [0, 0.5, 0] anchor so the initial view is pixel-identical).
  const orbit = useRef({ yaw: 0, elev: 0.35, distance: 9, target: { x: 0, y: 0.5, z: 0 } });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [, setRenderTick] = useState(0);

  // Refs mirror the latest props for the mount-stable rAF loop: the loop
  // reads authored data fresh every frame without re-subscribing.
  const screenRef = useRef(screen);
  const selectedRef = useRef(selectedId ?? null);
  const getPropsRef = useRef(getProps);
  const runtimeEmitRef = useRef(runtimeEmit);
  const modeRef = useRef(mode);
  screenRef.current = screen;
  selectedRef.current = selectedId ?? null;
  getPropsRef.current = getProps;
  runtimeEmitRef.current = runtimeEmit;
  modeRef.current = mode;

  // TASK 53: derive world transforms from the parentId hierarchy — the
  // renderer consumes derived world matrices; authored locals stay canonical.
  const worldRef = useRef(computeWorldMatrices(screen.components));
  worldRef.current = computeWorldMatrices(screen.components);

  // TASK 54: runtime physics — seeded once per mount (restart remounts the
  // viewport); body state is transient and never touches the model.
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const bodiesRef = useRef<{ id: string; matrix: number[]; state: PhysicsBodyState; config: PhysicsConfig }[]>([]);
  const accumulatorRef = useRef(0);
  const missingMovementWarned = useRef(false);

  // TASK 57: runtime character-controller input. The pressed-key set feeds
  // the controller each fixed step; the jump edge is consumed exactly once.
  // Listeners exist in RUNTIME mode only — editor shortcuts are untouched.
  const keysPressedRef = useRef<Set<string>>(new Set());
  const jumpQueuedRef = useRef(false);
  const controllerKeysRef = useRef<Record<string, string[]>>({});
  useEffect(() => {
    if (mode !== "runtime") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!keysPressedRef.current.has(key)) {
        keysPressedRef.current.add(key);
        if (!event.repeat) jumpQueuedRef.current = true; // one edge per press
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysPressedRef.current.delete(event.key.toLowerCase());
    };
    const onBlur = () => keysPressedRef.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      keysPressedRef.current.clear();
      jumpQueuedRef.current = false;
    };
  }, [mode]);

  // TASK 56: editor transform gizmos. Mode/space are editor state (never the
  // model); a drag keeps its own deterministic math state and commits ONE
  // canonical updateProps at pointer release — one drag, one undo entry.
  const [gizmoMode, setGizmoMode] = useState<GizmoKind>("move");
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpace>("local");
  const gizmoModeRef = useRef(gizmoMode);
  const gizmoSpaceRef = useRef(gizmoSpace);
  const onTransformRef = useRef(onTransform);
  gizmoModeRef.current = gizmoMode;
  gizmoSpaceRef.current = gizmoSpace;
  onTransformRef.current = onTransform;
  const gizmoGeometryRef = useRef<GizmoHandleGeometry | null>(null);
  const worldMatricesRef = useRef<ReturnType<typeof computeWorldMatrices>["matrices"] | null>(null);
  // TASK 60: a drag must never end in an accidental selection. Chromium fires
  // a click after every pointer drag on the same element, so the release
  // point would raycast-select whatever happens to be under it (gizmo drags
  // and orbits alike). The press tracks cumulative movement; click() ignores
  // anything that moved more than a few pixels.
  const pressRef = useRef<{ last: { x: number; y: number }; moved: number } | null>(null);
  const gizmoDrag = useRef<
    | null
    | {
        nodeId: string;
        kind: GizmoKind;
        axis: GizmoAxis;
        uniform: boolean;
        startPointer: { x: number; y: number };
        startWorldCenter: Vec3;
        axes: [Vec3, Vec3, Vec3];
        parentWorldInv: number[] | null;
        startLocal: { px: number; py: number; pz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
        rayStartParam: number | null;
        ringBasis: { u: Vec3; v: Vec3 } | null;
        startAngle: number;
        centerScreen: { x: number; y: number };
        screenDir: { x: number; y: number };
        startProj: number;
        current: { px: number; py: number; pz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
      }
  >(null);

  // TASK 60 §18/§19/§25: editor view/interaction options — editor state,
  // never the model. Colliders stay ON by default: the collider overlay has
  // been part of how the editor reads a scene since TASK 55, and flipping it
  // off would silently regress every collider-focused workflow.
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [collidersVisible, setCollidersVisible] = useState(true);
  // TASK 60 §25: Select tool — no gizmo, click only. Q/W/E/R switch tools.
  const [selectMode, setSelectMode] = useState(false);
  // TASK 60 §20: viewport-local multi-select (ctrl+click). Highlights in the
  // canvas, group delete/duplicate; the gizmo stays single-selection — the
  // one canonical transform pipeline is per-entity (documented limitation).
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const snapRef = useRef(snapEnabled);
  const gridRef = useRef(gridVisible);
  const collidersRef = useRef(collidersVisible);
  const selectModeRef = useRef(selectMode);
  const multiRef = useRef(multiSelected);
  snapRef.current = snapEnabled;
  gridRef.current = gridVisible;
  collidersRef.current = collidersVisible;
  selectModeRef.current = selectMode;
  multiRef.current = multiSelected;

  // External selection or hierarchy changes reset the viewport-local set.
  useEffect(() => {
    setMultiSelected(new Set());
  }, [selectedId, screen]);

  // TASK 60 §22: frame/reset — real orbit operations over the derived world
  // matrices. Ref-only bodies, so the mount-stable keyboard effect can call
  // the first render's closures safely.
  const resetView = () => {
    orbit.current = { yaw: 0, elev: 0.35, distance: 9, target: { x: 0, y: 0.5, z: 0 } };
  };
  const frameSelected = () => {
    const id = selectedRef.current;
    const entry = id ? worldRef.current.matrices.get(id) : null;
    if (!entry) return;
    const c = worldCenterOf(entry.matrix);
    orbit.current.target = { x: c.x, y: c.y, z: c.z };
  };
  const frameAll = () => {
    const matrices = screenRef.current.components
      .filter((c) => MESH_TYPES.has(c.type) && c.props?.visible !== false)
      .map((c) => worldRef.current.matrices.get(c.id)?.matrix)
      .filter((m): m is number[] => Boolean(m));
    if (matrices.length === 0) {
      resetView();
      return;
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const matrix of matrices) {
      const box = aabbFromMatrix(matrix, { x: 0.5, y: 0.5, z: 0.5 });
      minX = Math.min(minX, box.min.x);
      minY = Math.min(minY, box.min.y);
      minZ = Math.min(minZ, box.min.z);
      maxX = Math.max(maxX, box.max.x);
      maxY = Math.max(maxY, box.max.y);
      maxZ = Math.max(maxZ, box.max.z);
    }
    orbit.current.target = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
    const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    orbit.current.distance = Math.min(80, Math.max(9, radius * 2.6));
  };

  useEffect(() => {
    if (modeRef.current !== "runtime") return;
    physicsRef.current = new PhysicsWorld(parseSceneGravity(screenRef.current.styles ?? {}));
    bodiesRef.current = [];
    for (const component of screenRef.current.components) {
      const config = parsePhysicsConfig(getPropsRef.current?.(component.id) ?? component.props);
      if (config.bodyType === "none" || config.colliderType === "none" || !config.enabled) continue;
      const entry = worldRef.current.matrices.get(component.id);
      if (!entry) continue;
      const center = mat4TransformPoint(entry.matrix, [0, 0, 0]);
      const m = entry.matrix;
      // Collider dimensions follow the entity's world scale — the same
      // convention the editor gizmos and the export runtime use.
      const scale: [number, number, number] = [
        Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0) || 1,
        Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0) || 1,
        Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0) || 1,
      ];
      physicsRef.current.addBody({
        id: component.id, config, x: center[0], y: center[1], z: center[2], vx: 0, vy: 0, vz: 0, grounded: false, scale,
      });
      bodiesRef.current.push({ id: component.id, matrix: entry.matrix, state: physicsRef.current.bodies[physicsRef.current.bodies.length - 1]!, config });
    }
  }, []);

  const buildCamera = (): Camera3DState =>
    modeRef.current === "runtime"
      ? cameraOf3D(screenRef.current)
      : (() => {
          const { yaw, elev, distance, target } = orbit.current;
          const deg = 180 / Math.PI;
          return {
            position: [
              target.x + distance * Math.cos(elev) * Math.sin(yaw),
              target.y + distance * Math.sin(elev),
              target.z + distance * Math.cos(elev) * Math.cos(yaw),
            ],
            rotation: [-elev * deg, yaw * deg, 0],
            fov: 60,
            near: 0.1,
            far: 2000,
          };
        })();

  /** Builds fresh meshes for one frame: canonical transforms through the
   * hierarchy, runtime props (block set-property), and physics overrides
   * for dynamic bodies. `matrices`/`components` may be precomputed/overridden
   * by the frame loop (gizmo drag preview). */
  const buildFrameMeshes = (
    precomputed?: ReturnType<typeof computeWorldMatrices>["matrices"],
    componentsOverride?: ProjectModelComponent[],
  ): Mesh3D[] => {
    const current = screenRef.current;
    const list = componentsOverride ?? current.components;
    const propsOf = (id: string): PropsMap => getPropsRef.current?.(id) ?? list.find((c) => c.id === id)?.props ?? {};
    const matrices = precomputed ?? computeWorldMatrices(list).matrices;
    const physics = physicsRef.current;
    const out: Mesh3D[] = [];
    for (const component of list) {
      const mesh = meshOf(component, propsOf(component.id));
      if (!mesh) continue;
      // TASK 53: every mesh renders through its derived world matrix so the
      // parent chain (move/rotate/scale) is visible in the runtime.
      const entry = matrices.get(component.id);
      if (entry) mesh.matrix = [...entry.matrix];
      const body = physics?.bodies.find((b) => b.id === component.id);
      if (body && body.config.bodyType === "dynamic") {
        // Dynamic bodies render at their runtime world positions (rotation/
        // scale preserved from the hierarchy matrix, translation overridden).
        const matrix = [...(mesh.matrix ?? mat4Identity())];
        matrix[12] = body.x;
        matrix[13] = body.y;
        matrix[14] = body.z;
        mesh.matrix = matrix;
      }
      out.push(mesh);
    }
    return out;
  };

  // One mount-stable rAF loop: physics (runtime only) then draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const frameDt = Math.min((now - last) / 1000, 0.25);
      last = now;

        if (modeRef.current === "runtime" && physicsRef.current) {
          // Fixed-timestep accumulation — bounded catch-up, no spiral.
          accumulatorRef.current += frameDt;
          let steps = 0;
          // TASK 57: controller keys from the screen's canonical inputActions
          // (rebuilt per frame — rebinding applies live). The drag override
          // below never applies in runtime mode, so the canonical list is
          // the correct source here.
          controllerKeysRef.current = resolveControllerKeys(screenRef.current);
          const components = screenRef.current.components;
          const controllerComponent = components.find((c) => parseController3D(propsRefGet(c.id)).enabled);
          const cameraComponent =
            components.find((c) => c.type === "camera3d" && c.props?.active === true) ??
            components.find((c) => c.type === "camera3d");
          const camRot: [number, number, number] = [
            Number(cameraComponent?.props?.rx) || 0,
            Number(cameraComponent?.props?.ry) || 0,
            Number(cameraComponent?.props?.rz) || 0,
          ];
          while (accumulatorRef.current >= PHYSICS_LIMITS.fixedDt && steps < PHYSICS_LIMITS.maxCatchUpSteps) {
            // TASK 57: the controller decides velocities for its fixed step;
            // the existing physics world integrates/collides/resolves.
            if (controllerComponent) {
              const config = parseController3D(propsRefGet(controllerComponent.id));
              const body = physicsRef.current.bodies.find((b) => b.id === controllerComponent.id);
              if (body) {
                const input = inputVector(keysPressedRef.current, controllerKeysRef.current);
                const basis = cameraBasis(rotationMatrix(camRot));
                const v = controllerVelocity({
                  vx: body.vx, vz: body.vz, input, basis, config, grounded: body.grounded, dt: PHYSICS_LIMITS.fixedDt,
                });
                body.vx = v.vx;
                body.vz = v.vz;
                if (jumpQueuedRef.current && body.grounded && config.jumpForce > 0) {
                  body.vy = config.jumpForce; // physics-driven impulse, one per edge
                  jumpQueuedRef.current = false;
                }
              }
            }
            physicsRef.current.step(PHYSICS_LIMITS.fixedDt, (event) => {
              // Trigger events ride the EXISTING touches- handler vocabulary.
              if (event.phase === "enter") runtimeEmitRef.current?.(event.componentId, `touches-${event.triggerId}`);
              if (event.phase === "exit") runtimeEmitRef.current?.(event.componentId, `touches-exit-${event.triggerId}`);
            });
            accumulatorRef.current -= PHYSICS_LIMITS.fixedDt;
            steps++;
          }
          jumpQueuedRef.current = false; // an unconsumed edge expires with the frame
          if (steps === PHYSICS_LIMITS.maxCatchUpSteps) accumulatorRef.current = 0;
          const bodies = physicsRef.current.bodies;
          const dynamicBodies = bodies.filter((b) => b.config.bodyType === "dynamic");
          canvas.dataset.physicsBodies = JSON.stringify(
            bodies.map((b) => ({
              id: b.id,
              x: Number(b.x.toFixed(3)),
              y: Number(b.y.toFixed(3)),
              z: Number(b.z.toFixed(3)),
              grounded: b.grounded,
              trigger: b.config.isTrigger,
            })),
          );
          canvas.dataset.triggerOverlaps = physicsRef.current.triggerOverlaps().join("|");
          canvas.dataset.physicsGrounded = String(dynamicBodies.some((b) => b.grounded));
          // TASK 57: controller observability (runtime diagnostics only —
          // never a source of truth).
          const playerBody = controllerComponent ? bodies.find((b) => b.id === controllerComponent.id) : null;
          const playerConfig = controllerComponent ? parseController3D(propsRefGet(controllerComponent.id)) : null;
          canvas.setAttribute("data-3d-player", controllerComponent?.id ?? "");
          canvas.setAttribute("data-controller-enabled", String(playerConfig?.enabled === true));
          canvas.setAttribute("data-controller-grounded", String(playerBody?.grounded === true));
          canvas.setAttribute(
            "data-controller-speed",
            playerBody ? Math.hypot(playerBody.vx, playerBody.vz).toFixed(2) : "0.00",
          );
        }

      // TASK 56: during a gizmo drag the selected entity's canonical-local
      // transform is PREVIEWED (deterministic drag math) without touching the
      // model — the commit happens once at pointer release.
      const drag = gizmoDrag.current;
      const components = drag
        ? screenRef.current.components.map((c) =>
            c.id === drag.nodeId ? { ...c, props: { ...c.props, ...drag.current } } : c,
          )
        : screenRef.current.components;
      // TASK 55: ambient + resolved world lights feed the rasterizer in BOTH
      // modes — the editor must show the same illumination as the runtime.
      const ambient = parseAmbient3D(screenRef.current.styles ?? {});
      const worldMatrices = computeWorldMatrices(components).matrices;
      worldMatricesRef.current = worldMatrices;
      const { lights } = resolveLights3D(components, propsRefGet, worldMatrices);
      const meshes = buildFrameMeshes(worldMatrices, components);
      drawScene3D(ctx, {
        width: canvas.width,
        height: canvas.height,
        camera: buildCamera(),
        meshes,
        lights,
        ambient,
        grid: modeRef.current === "editor" && gridRef.current,
        selectedId: modeRef.current === "editor" ? selectedRef.current ?? undefined : undefined,
        highlightIds:
          modeRef.current === "editor" && multiRef.current.size > 0 ? [...multiRef.current] : undefined,
      });
      if (modeRef.current === "editor") {
        // TASK 60: editor observability for the E2E suites (never a source
        // of truth — the React state above is).
        canvas.dataset.snapEnabled = String(snapRef.current);
        canvas.dataset.gridVisible = String(gridRef.current);
        canvas.dataset.collidersVisible = String(collidersRef.current);
        canvas.dataset.selectMode = String(selectModeRef.current);
        canvas.dataset.orbitTarget = JSON.stringify({
          x: Number(orbit.current.target.x.toFixed(3)),
          y: Number(orbit.current.target.y.toFixed(3)),
          z: Number(orbit.current.target.z.toFixed(3)),
        });
        canvas.dataset.orbitDistance = orbit.current.distance.toFixed(2);
        // Collider gizmos only for entities that actually have a collider.
        // TASK 60 §25: the overlay is toggleable (default ON).
        const gizmos = components
          .filter((c) => c.type !== "camera3d" && c.type !== "light3d")
          .map((c) => {
            const config = parsePhysicsConfig(propsRefGet(c.id));
            const matrix = worldMatrices.get(c.id)?.matrix;
            const center = matrix ? mat4TransformPoint(matrix, [0, 0, 0]) : ([Number(c.props?.px) || 0, Number(c.props?.py) || 0, Number(c.props?.pz) || 0] as [number, number, number]);
            const scale = matrix
              ? [0, 1, 2].map((col) => Math.hypot(matrix[col] ?? 0, matrix[col + 1] ?? 0, matrix[col + 2] ?? 0))
              : [1, 1, 1];
            return {
              id: c.id,
              cx: center[0],
              cy: center[1],
              cz: center[2],
              hx: (config.sizeX / 2) * (scale[0] || 1),
              hy: (config.sizeY / 2) * (scale[1] || 1),
              hz: (config.sizeZ / 2) * (scale[2] || 1),
              radius: config.radius * (scale[0] || 1),
              isSphere: config.colliderType === "sphere",
              isTrigger: config.isTrigger,
              hasCollider: config.colliderType !== "none",
            };
          })
          .filter((g) => g.hasCollider);
        if (collidersRef.current) {
          drawColliderGizmos(ctx, canvas.width, canvas.height, buildCamera(), gizmos);
        }
        // Light gizmos (TASK 55): marker + influence ring / direction arrow,
        // including disabled lights (drawn dimmed). Editor-only.
        const lightGizmos = lights.map((l) => ({
          type: l.type,
          position: l.position,
          direction: l.direction,
          radius: l.radius,
          color: l.color,
          enabled: l.enabled,
        }));
        drawLightGizmos(ctx, canvas.width, canvas.height, buildCamera(), lightGizmos);
        // TASK 56: the transform gizmo on the selected entity (editor-only).
        // TASK 60 §25: the Select tool suppresses the gizmo entirely.
        const selectedEntry = selectedRef.current ? worldMatrices.get(selectedRef.current) : null;
        if (selectModeRef.current) {
          gizmoGeometryRef.current = null;
          delete canvas.dataset.transformMode;
          delete canvas.dataset.gizmoHandles;
        } else if (selectedEntry && selectedRef.current) {
          const gAxes = gizmoAxes(gizmoSpaceRef.current, selectedEntry.matrix);
          const gOrigin = worldCenterOf(selectedEntry.matrix);
          const gSpec = {
            kind: gizmoModeRef.current,
            origin: [gOrigin.x, gOrigin.y, gOrigin.z] as [number, number, number],
            axes: [
              [gAxes[0].x, gAxes[0].y, gAxes[0].z],
              [gAxes[1].x, gAxes[1].y, gAxes[1].z],
              [gAxes[2].x, gAxes[2].y, gAxes[2].z],
            ] as [[number, number, number], [number, number, number], [number, number, number]],
            activeAxis: (drag?.axis ?? null) as GizmoAxisName | null,
          };
          const geometry = projectTransformGizmo(canvas.width, canvas.height, buildCamera(), gSpec, 64, 52);
          gizmoGeometryRef.current = geometry;
          if (geometry) {
            drawTransformGizmo(ctx, geometry, gSpec, selectedRef.current);
            canvas.dataset.transformMode = gizmoModeRef.current;
            canvas.dataset.transformSpace = gizmoSpaceRef.current;
            canvas.dataset.gizmoHandles = JSON.stringify({
              origin: geometry.originScreen ? [Math.round(geometry.originScreen[0]), Math.round(geometry.originScreen[1])] : null,
              lines: geometry.lines.map((l) => ({ axis: l.axis, x0: Math.round(l.x0), y0: Math.round(l.y0), x1: Math.round(l.x1), y1: Math.round(l.y1) })),
              rings: geometry.rings.map((r) => {
                const cx = r.points.reduce((s, p) => s + p[0], 0) / (r.points.length || 1);
                const cy = r.points.reduce((s, p) => s + p[1], 0) / (r.points.length || 1);
                const r0 = r.points.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / (r.points.length || 1);
                return { axis: r.axis, cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r0), points: r.points.map((p) => [Math.round(p[0]), Math.round(p[1])] as [number, number]) };
              }),
            });
          } else {
            gizmoGeometryRef.current = null;
          }
        } else {
          gizmoGeometryRef.current = null;
          delete canvas.dataset.transformMode;
          delete canvas.dataset.gizmoHandles;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs keep the loop mount-stable
  }, []);

  const propsRefGet = (id: string): PropsMap => getPropsRef.current?.(id) ?? screenRef.current.components.find((c) => c.id === id)?.props ?? {};

  // ---- TASK 56: gizmo picking + deterministic drag math ---------------------------

  const gizmoCanvasPoint = (event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  };

  const distanceToSegment = (px: number, py: number, x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0, dy = y1 - y0;
    const lenSq = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / lenSq));
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  };

  /** Nearest gizmo handle under a canvas point, or null. Mirrors the drawn
   * geometry exactly (same projected handle set). */
  const pickGizmoHandle = (x: number, y: number): { axis: GizmoAxis; uniform?: boolean } | null => {
    const geometry = gizmoGeometryRef.current;
    if (!geometry) return null;
    const threshold = 14;
    let best: { axis: GizmoAxis; uniform?: boolean; distance: number } | null = null;
    for (const line of geometry.lines) {
      const d = distanceToSegment(x, y, line.x0, line.y0, line.x1, line.y1);
      if (d <= threshold && (!best || d < best.distance)) best = { axis: line.axis, distance: d };
    }
    for (const ring of geometry.rings) {
      for (const p of ring.points) {
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d <= threshold && (!best || d < best.distance)) best = { axis: ring.axis, distance: d };
      }
    }
    if (gizmoModeRef.current === "scale" && geometry.originScreen) {
      const d = Math.hypot(x - geometry.originScreen[0], y - geometry.originScreen[1]);
      if (d <= 10 && (!best || d < best.distance)) best = { axis: "x", uniform: true, distance: d };
    }
    return best ? { axis: best.axis, uniform: best.uniform } : null;
  };

  const startGizmoDrag = (nodeId: string, axis: GizmoAxis, uniform: boolean, px: number, py: number, canvas: HTMLCanvasElement) => {
    const component = screenRef.current.components.find((c) => c.id === nodeId);
    const matrix = worldMatricesRef.current?.get(nodeId)?.matrix;
    if (!component || !matrix) return;
    const numOr = (key: string, fallback: number) => {
      const v = Number(component.props?.[key]);
      return Number.isFinite(v) ? v : fallback;
    };
    const startLocal = {
      px: numOr("px", 0), py: numOr("py", 0.5), pz: numOr("pz", 0),
      rx: numOr("rx", 0), ry: numOr("ry", 0), rz: numOr("rz", 0),
      sx: numOr("sx", 1), sy: numOr("sy", 1), sz: numOr("sz", 1),
    };
    // Parent's world matrix inverse — world→local conversion for parented
    // entities (the hierarchy rules stay the only source of truth).
    const parentId = typeof component.props?.parentId === "string" ? component.props.parentId : "";
    const parentMatrix = parentId ? worldMatricesRef.current?.get(parentId)?.matrix : undefined;
    const parentWorldInv = parentMatrix ? mat4Invert(parentMatrix) : null;
    if (parentId && parentMatrix && !parentWorldInv) return; // singular parent — cancel instead of guessing
    const camera = buildCamera();
    const axes = gizmoAxes(gizmoSpaceRef.current, matrix);
    const center = worldCenterOf(matrix);
    const geometry = gizmoGeometryRef.current;
    const kind = gizmoModeRef.current;
    let rayStartParam: number | null = null;
    let startAngle = 0;
    let ringBasis: { u: Vec3; v: Vec3 } | null = null;
    let screenDir = { x: 1, y: 0 };
    let centerScreen = { x: px, y: py };
    let startProj = 0;
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const axisVec = uniform ? { x: 1, y: 1, z: 1 } : axes[axisIndex];
    if (kind === "move") {
      rayStartParam = axisRayParameter(center, axisVec, screenToWorldRay(camera, px, py, canvas.width, canvas.height));
      if (rayStartParam === null) return; // near-parallel — refuse deterministically
    } else if (kind === "rotate") {
      ringBasis = planeBasis(axisVec);
      const point = rayPlanePoint(center, axisVec, screenToWorldRay(camera, px, py, canvas.width, canvas.height));
      if (!point) return;
      startAngle = planarAngle(center, point, ringBasis.u, ringBasis.v);
    } else {
      if (geometry?.originScreen) centerScreen = { x: geometry.originScreen[0], y: geometry.originScreen[1] };
      const line = geometry?.lines.find((l) => l.axis === axis);
      if (line) {
        const dx = line.x1 - line.x0, dy = line.y1 - line.y0;
        const len = Math.hypot(dx, dy) || 1;
        screenDir = { x: dx / len, y: dy / len };
      }
      startProj = (px - centerScreen.x) * screenDir.x + (py - centerScreen.y) * screenDir.y;
    }
    gizmoDrag.current = {
      nodeId, kind, axis, uniform,
      startPointer: { x: px, y: py },
      startWorldCenter: center,
      axes,
      parentWorldInv,
      startLocal,
      rayStartParam,
      ringBasis,
      startAngle,
      centerScreen,
      screenDir,
      startProj,
      current: { ...startLocal },
    };
  };

  const updateGizmoDrag = (px: number, py: number, canvas: HTMLCanvasElement) => {
    const drag = gizmoDrag.current;
    if (!drag) return;
    const camera = buildCamera();
    const ray = screenToWorldRay(camera, px, py, canvas.width, canvas.height);
    const axisIndex = drag.axis === "x" ? 0 : drag.axis === "y" ? 1 : 2;
    if (drag.kind === "move") {
      const a = drag.uniform ? drag.axes[0] : drag.axes[axisIndex];
      const s = axisRayParameter(drag.startWorldCenter, a, ray);
      if (s === null || drag.rayStartParam === null) return;
      // TASK 60 §21: snap the DELTA (never the absolute pose) to the move
      // step, so the object's sub-step starting offset is preserved.
      const raw = s - drag.rayStartParam;
      const delta = snapRef.current ? snapToStep(raw, GIZMO_SNAP_STEPS.move) : raw;
      const world: Vec3 = {
        x: drag.startWorldCenter.x + a.x * delta,
        y: drag.startWorldCenter.y + a.y * delta,
        z: drag.startWorldCenter.z + a.z * delta,
      };
      const localPoint = drag.parentWorldInv
        ? mat4TransformPoint(drag.parentWorldInv, [world.x, world.y, world.z])
        : [world.x, world.y, world.z];
      drag.current = {
        ...drag.startLocal,
        px: localPoint[0] ?? drag.startLocal.px,
        py: localPoint[1] ?? drag.startLocal.py,
        pz: localPoint[2] ?? drag.startLocal.pz,
      };
    } else if (drag.kind === "rotate") {
      if (!drag.ringBasis) return;
      const a = drag.axes[axisIndex];
      const point = rayPlanePoint(drag.startWorldCenter, a, ray);
      if (!point) return;
      const angle = planarAngle(drag.startWorldCenter, point, drag.ringBasis.u, drag.ringBasis.v);
      const rawDeg = (angleDelta(drag.startAngle, angle) * 180) / Math.PI;
      const deltaDeg = snapRef.current ? snapToStep(rawDeg, GIZMO_SNAP_STEPS.rotate) : rawDeg;
      const next = { ...drag.startLocal };
      if (drag.axis === "x") next.rx = drag.startLocal.rx + deltaDeg;
      if (drag.axis === "y") next.ry = drag.startLocal.ry + deltaDeg;
      if (drag.axis === "z") next.rz = drag.startLocal.rz + deltaDeg;
      drag.current = next;
    } else {
      const proj = (px - drag.centerScreen.x) * drag.screenDir.x + (py - drag.centerScreen.y) * drag.screenDir.y;
      // factor relative to the drag-start projection; each axis scales from
      // its own start value (uniform multiplies all three by the factor).
      const factor = scaleFromProjection(drag.startProj, proj, 1);
      const clampScale = (v: number) => Math.min(100, Math.max(0.1, Number.isFinite(v) ? v : 1));
      // TASK 60 §21: snap the resulting scale to the 0.1 step (re-clamped),
      // applied only to the dragged axes so untouched axes never move.
      const scaleOut = (v: number) => {
        const clamped = clampScale(v);
        return snapRef.current ? clampScale(snapToStep(clamped, GIZMO_SNAP_STEPS.scale)) : clamped;
      };
      drag.current = {
        ...drag.startLocal,
        sx: drag.uniform || drag.axis === "x" ? scaleOut(drag.startLocal.sx * factor) : drag.startLocal.sx,
        sy: drag.uniform || drag.axis === "y" ? scaleOut(drag.startLocal.sy * factor) : drag.startLocal.sy,
        sz: drag.uniform || drag.axis === "z" ? scaleOut(drag.startLocal.sz * factor) : drag.startLocal.sz,
      };
    }
  };

  const commitGizmoDrag = () => {
    const drag = gizmoDrag.current;
    gizmoDrag.current = null;
    if (!drag) return;
    // ONE canonical, undoable commit per completed drag — through the
    // builder's existing action pipeline.
    onTransformRef.current?.(drag.nodeId, {
      px: drag.current.px, py: drag.current.py, pz: drag.current.pz,
      rx: drag.current.rx, ry: drag.current.ry, rz: drag.current.rz,
      sx: drag.current.sx, sy: drag.current.sy, sz: drag.current.sz,
    });
  };

  // TASK 56: keyboard mode switching (W/E/R) and Escape cancel. Capture
  // phase so an active drag's Escape cancels BEFORE the builder's global
  // Escape-to-deselect runs. Typing in inputs never switches modes.
  useEffect(() => {
    if (mode !== "editor") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (gizmoDrag.current && event.key === "Escape") {
        gizmoDrag.current = null; // cancel: discard the preview, nothing committed
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable === true;
      if (inField || event.ctrlKey || event.metaKey || event.altKey) return;
      // TASK 60 §20: Escape clears the viewport-local multi-select (capture
      // phase, so the builder's global Escape-to-deselect doesn't also run).
      if (event.key === "Escape" && multiRef.current.size > 0) {
        setMultiSelected(new Set());
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "q") setSelectMode(true);
      else if (key === "w") {
        setSelectMode(false);
        setGizmoMode("move");
      } else if (key === "e") {
        setSelectMode(false);
        setGizmoMode("rotate");
      } else if (key === "r") {
        setSelectMode(false);
        setGizmoMode("scale");
      } else if (key === "f") frameSelected(); // TASK 60 §22: focus selected
      else if (event.key === "Home") frameAll(); // TASK 60 §22: frame all
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  // TASK 63 §15: the mouse wheel OVER the 3D viewport is 3D navigation —
  // wheel zooms the orbit camera (never page scroll). Non-passive listener
  // with preventDefault so the outer app never scrolls behind it; the
  // palette/inspector keep their own wheel scrolling untouched.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "editor") return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
      orbit.current.distance = Math.min(80, Math.max(3, orbit.current.distance * factor));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [mode]);

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "editor") return;
    pressRef.current = { last: { x: event.clientX, y: event.clientY }, moved: 0 };
    const canvas = event.currentTarget;
    const point = gizmoCanvasPoint(event, canvas);
    // TASK 60 §25: the Select tool never engages the gizmo.
    if (!selectModeRef.current && selectedRef.current && pickGizmoHandle(point.x, point.y)) {
      const hit = pickGizmoHandle(point.x, point.y)!;
      startGizmoDrag(selectedRef.current, hit.axis, hit.uniform === true, point.x, point.y, canvas);
      if (gizmoDrag.current) {
        // Transforming: orbit and selection must not react until release.
        event.currentTarget.setPointerCapture(event.pointerId);
        canvas.dataset.gizmoDragging = "true";
        return;
      }
    }
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "editor") return;
    const canvas = event.currentTarget;
    if (pressRef.current) {
      pressRef.current.moved += Math.hypot(
        event.clientX - pressRef.current.last.x,
        event.clientY - pressRef.current.last.y,
      );
      pressRef.current.last = { x: event.clientX, y: event.clientY };
    }
    if (gizmoDrag.current) {
      const point = gizmoCanvasPoint(event, canvas);
      updateGizmoDrag(point.x, point.y, canvas);
      return; // camera orbit MUST NOT activate while transforming
    }
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    orbit.current.yaw += dx * 0.01;
    orbit.current.elev = Math.min(1.4, Math.max(-1.4, orbit.current.elev + dy * 0.01));
    setRenderTick((t) => t + 1);
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "editor") return;
    if (gizmoDrag.current) {
      commitGizmoDrag();
      delete event.currentTarget.dataset.gizmoDragging;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const click = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "editor" || !onSelect) return;
    // A drag that ends here is not a click: ignore anything that moved
    // (gizmo drags and orbit drags both trail a synthetic click).
    if (pressRef.current && pressRef.current.moved > 6) {
      pressRef.current = null;
      return;
    }
    pressRef.current = null;
    // TASK 60 §17: pointer → BACKING-STORE canvas pixels, the SAME mapping the
    // gizmo math uses (gizmoCanvasPoint). The pre-TASK-60 picker compared raw
    // display pixels against backing-store projections — silently wrong at
    // any display scale ≠ 1:1.
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const width = canvas.width;
    const height = canvas.height;
    const cameraNow = buildCamera();
    // TASK 60 §17: real picking — the pointer ray vs each entity's world
    // AABB (raycastAABB slab method), nearest hit wins. The old nearest-
    // center fallback (32px screen radius) stays for misses/thin targets so
    // the click UX never regresses; both read the SAME derived matrices.
    const ray = screenToWorldRay(cameraNow, x, y, width, height);
    let best: string | null = null;
    let bestT = Infinity;
    for (const component of screenRef.current.components) {
      if (!MESH_TYPES.has(component.type)) continue;
      if (component.props?.visible === false) continue;
      const entry = worldRef.current.matrices.get(component.id);
      if (!entry) continue;
      const box = aabbFromMatrix(entry.matrix, { x: 0.5, y: 0.5, z: 0.5 });
      const t = raycastAABB(ray.origin, ray.dir, box.min, box.max);
      if (t !== null && t < bestT) {
        bestT = t;
        best = component.id;
      }
    }
    if (!best) {
      let bestDistance = 32;
      for (const component of screenRef.current.components) {
        if (!MESH_TYPES.has(component.type)) continue;
        const entry = worldRef.current.matrices.get(component.id);
        const center = entry ? mat4TransformPoint(entry.matrix, [0, 0, 0]) : null;
        if (!center) continue;
        const view = rotateForPick(
          [center[0] - cameraNow.position[0], center[1] - cameraNow.position[1], center[2] - cameraNow.position[2]],
          [-cameraNow.rotation[0], -cameraNow.rotation[1], -cameraNow.rotation[2]],
        );
        if (view[2] >= -cameraNow.near) continue;
        const focal = height / 2 / Math.tan((cameraNow.fov * Math.PI) / 360);
        const sx = width / 2 + (view[0] * focal) / -view[2];
        const sy = height / 2 - (view[1] * focal) / -view[2];
        const distance = Math.hypot(sx - x, sy - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = component.id;
        }
      }
    }
    // TASK 60 §20: ctrl+click toggles viewport-local multi-select membership
    // (highlight + group tools); it never changes the primary selection.
    if (event.ctrlKey || event.metaKey) {
      const hit = best;
      if (hit) {
        setMultiSelected((prev) => {
          const next = new Set(prev);
          if (next.has(hit)) next.delete(hit);
          else next.add(hit);
          return next;
        });
      }
      return;
    }
    if (multiRef.current.size > 0) setMultiSelected(new Set());
    if (best) onSelect(best);
  };

  return (
    <div
      className="relative h-full w-full"
      style={{ background: "#0c0f17" }}
      // Viewport interactions (select via canvas or hierarchy panel) must not
      // bubble to the builder shell's click-to-deselect.
      onClick={(event) => event.stopPropagation()}
      data-transform-mode={mode === "editor" ? gizmoMode : undefined}
      data-transform-space={mode === "editor" ? gizmoSpace : undefined}
    >
      <canvas
        ref={canvasRef}
        data-viewport-3d="true"
        width={1200}
        height={900}
        className="h-full w-full"
        style={{ cursor: mode === "editor" ? "grab" : "default", touchAction: "none" }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onClick={click}
      />
      {mode === "editor" ? (
        <div
          role="toolbar"
          aria-label="Transform tools"
          data-3d-toolbar="true"
          className="absolute left-1/2 top-2 flex max-w-[calc(100%-12px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-panel/95 p-1 shadow-sm backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {([
            ["select", "Select", "Q"],
            ["move", "Move", "W"],
            ["rotate", "Rotate", "E"],
            ["scale", "Scale", "R"],
          ] as const).map(([kind, label, shortcut]) => (
            <button
              key={kind}
              type="button"
              data-tool={kind}
              aria-pressed={kind === "select" ? selectMode : !selectMode && gizmoMode === kind}
              title={`${label} (${shortcut})`}
              onClick={() => {
                if (kind === "select") setSelectMode(true);
                else {
                  setSelectMode(false);
                  setGizmoMode(kind);
                }
              }}
              className={`h-6 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
                (kind === "select" ? selectMode : !selectMode && gizmoMode === kind)
                  ? "bg-violet/25 text-ink"
                  : "text-mist hover:text-fog"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-line" />
          {(["local", "world"] as const).map((space) => (
            <button
              key={space}
              type="button"
              data-space={space}
              aria-pressed={gizmoSpace === space}
              title={`${space === "local" ? "Local" : "World"} space`}
              onClick={() => setGizmoSpace(space)}
              className={`h-6 rounded-md px-2 text-[11px] font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
                gizmoSpace === space ? "bg-violet/25 text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {space}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-line" />
          <button
            type="button"
            data-toggle="snap"
            aria-pressed={snapEnabled}
            title="Snap — move 0.5 · rotate 15° · scale 0.1"
            onClick={() => setSnapEnabled((v) => !v)}
            className={`h-6 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
              snapEnabled ? "bg-violet/25 text-ink" : "text-mist hover:text-fog"
            }`}
          >
            Snap
          </button>
          <button
            type="button"
            data-toggle="grid"
            aria-pressed={gridVisible}
            title="Show grid"
            onClick={() => setGridVisible((v) => !v)}
            className={`h-6 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
              gridVisible ? "bg-violet/25 text-ink" : "text-mist hover:text-fog"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            data-toggle="colliders"
            aria-pressed={collidersVisible}
            title="Collider overlays"
            onClick={() => setCollidersVisible((v) => !v)}
            className={`h-6 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
              collidersVisible ? "bg-violet/25 text-ink" : "text-mist hover:text-fog"
            }`}
          >
            Colliders
          </button>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <button
            type="button"
            data-action="frame-selected"
            title="Frame selected (F)"
            onClick={frameSelected}
            className="h-6 rounded-md px-2 text-[11px] font-medium text-mist transition-colors hover:text-fog focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          >
            Frame Sel
          </button>
          <button
            type="button"
            data-action="frame-all"
            title="Frame all (Home)"
            onClick={frameAll}
            className="h-6 rounded-md px-2 text-[11px] font-medium text-mist transition-colors hover:text-fog focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          >
            Frame All
          </button>
          <button
            type="button"
            data-action="reset-view"
            title="Reset view"
            onClick={resetView}
            className="h-6 rounded-md px-2 text-[11px] font-medium text-mist transition-colors hover:text-fog focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          >
            Reset
          </button>
        </div>
      ) : null}
      {mode === "editor" && multiSelected.size > 0 ? (
        <div
          data-multi-select-count={multiSelected.size}
          className="absolute bottom-9 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-sky/40 bg-[#12151f]/95 px-3 py-1.5 text-[12px] text-sky shadow-sm backdrop-blur"
        >
          <span className="whitespace-nowrap">{multiSelected.size} selected — group tools act on all</span>
          {onDuplicate || onDuplicateMany ? (
            <button
              type="button"
              data-multi-duplicate="true"
              onClick={() =>
                onDuplicateMany
                  ? onDuplicateMany([...multiSelected])
                  : [...multiSelected].forEach((id) => onDuplicate!(id))
              }
              className="h-6 rounded-md border border-line px-2 text-[11px] text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              Duplicate
            </button>
          ) : null}
          {onDelete || onDeleteMany ? (
            <button
              type="button"
              data-multi-delete="true"
              onClick={() =>
                onDeleteMany
                  ? onDeleteMany([...multiSelected])
                  : [...multiSelected].forEach((id) => onDelete!(id))
              }
              className="h-6 rounded-md border border-rose/40 px-2 text-[11px] text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Clear multi-selection"
            onClick={() => setMultiSelected(new Set())}
            className="h-6 w-6 rounded-md text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          >
            ✕
          </button>
        </div>
      ) : null}
      <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.14em] text-mist">
        3D VIEWPORT · {mode === "editor" ? "EDITOR" : "RUNTIME"}
      </span>
      {mode === "editor" ? (
        <HierarchyPanel
          screen={screen}
          selectedId={selectedId ?? null}
          onSelect={onSelect ?? (() => undefined)}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      ) : null}
    </div>
  );
}

/** TASK 53: the scene hierarchy — derived purely from parentId. Expandable
 * nodes, click-select (synchronized with viewport + inspector), delete with
 * child reparenting, duplicate subtree. Keyboard accessible. */
function HierarchyPanel({
  screen,
  selectedId,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  screen: ProjectModelScreen;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const entities = screen.components.filter(
    (c) => typeof c.props?.px === "number" && (c.props?.visible !== false || true),
  );
  const byId = new Map(entities.map((c) => [c.id, c]));
  const childrenOf = new Map<string, ProjectModelScreen["components"]>();
  const roots: ProjectModelScreen["components"] = [];
  for (const entity of entities) {
    const raw = entity.props?.parentId;
    const parent = typeof raw === "string" && raw !== "" && byId.has(raw) ? raw : "";
    if (parent) {
      const list = childrenOf.get(parent) ?? [];
      list.push(entity);
      childrenOf.set(parent, list);
    } else {
      roots.push(entity);
    }
  }

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (entity: ProjectModelComponent, depth: number): React.ReactElement => {
    const children = childrenOf.get(entity.id) ?? [];
    const isCollapsed = collapsed.has(entity.id);
    const isSelected = selectedId === entity.id;
    return (
      <li key={entity.id} role="treeitem" aria-expanded={children.length > 0 ? !isCollapsed : undefined} aria-selected={isSelected}>
        <div
          className={`group flex h-7 items-center gap-1 rounded-md px-1 ${isSelected ? "bg-violet/25 text-ink" : "text-fog hover:bg-surface"}`}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${entity.props?.name ?? entity.id}`}
              onClick={() => toggle(entity.id)}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect(entity.id)}
            aria-label={`Select ${String(entity.props?.name ?? entity.id)}`}
            className={`min-w-0 flex-1 truncate text-left text-[11.5px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${isSelected ? "font-semibold" : ""}`}
          >
            {String(entity.props?.name ?? entity.id)}
            {children.length > 0 ? (
              <span className="ml-1 text-[9.5px] text-mist">({children.length})</span>
            ) : null}
          </button>
          {onDuplicate ? (
            <button
              type="button"
              aria-label={`Duplicate ${entity.props?.name ?? entity.id} subtree`}
              title="Duplicate subtree"
              onClick={() => onDuplicate(entity.id)}
              className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-mist group-hover:flex hover:text-ink focus-visible:flex focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              ⧉
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              aria-label={`Delete ${entity.props?.name ?? entity.id} — children follow its parent`}
              title="Delete — children are reparented to this entity's parent"
              onClick={() => onDelete(entity.id)}
              className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-mist group-hover:flex hover:text-rose focus-visible:flex focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              ✕
            </button>
          ) : null}
        </div>
        {children.length > 0 && !isCollapsed ? (
          <ul role="group">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div
      data-hierarchy-panel="true"
      className="absolute right-2 top-2 max-h-[70%] w-52 overflow-y-auto rounded-lg border border-line bg-[#12151f]/95 p-2"
    >
      <p className="px-1 pb-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-mist">
        Hierarchy
      </p>
      <ul role="tree" aria-label="3D scene hierarchy" className="group flex flex-col">
        {roots.map((root) => renderNode(root, 0))}
      </ul>
    </div>
  );
}

/** Shared rotation math with render3d.ts (Z→X→Y application order). */
function rotateForPick(
  p: [number, number, number],
  rot: [number, number, number],
): [number, number, number] {
  let [x, y, z] = p;
  const rx = (rot[0] * Math.PI) / 180;
  const rz = (rot[2] * Math.PI) / 180;
  const ry = (rot[1] * Math.PI) / 180;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  const cx = Math.cos(rx), sx = Math.sin(rx);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  const cy = Math.cos(ry), sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}
