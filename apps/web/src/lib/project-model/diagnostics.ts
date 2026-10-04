import type { ProjectModel } from "@/types/project";
import {
  ANIMATOR_BUILTIN_PARAMS,
  hasUnknownSortingLayer,
  inputActionsOf,
  isHexColor,
  isSceneScreen,
  parseAnimations,
  parseAnimator,
  PLAYER_ACTION_JUMP,
  PLAYER_ACTION_LEFT,
  PLAYER_ACTION_RIGHT,
} from "@/lib/project-model/scene";
import { computeWorldMatrices } from "@/lib/hierarchy3d";

/**
 * Deterministic model diagnostics: structural problems the canonical model
 * itself reveals, independent of code. This is the seed of the Ideaven
 * validator — severity levels follow the platform convention (ERROR /
 * WARNING / INFO) and every diagnostic targets a navigable source (a
 * handler/block for Blocks mode, the code view for code-level issues).
 */

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ModelDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** Where the diagnostic points. */
  screenId: string;
  handlerId?: string;
  blockId?: string;
  componentId?: string;
}

/** Structural shape the block walker needs (subset of ProjectModelBlock). */
interface DiagBlock {
  id: string;
  type: string;
  inputs?: Record<string, unknown>;
  children?: DiagBlock[];
  elseChildren?: DiagBlock[];
  slots?: Record<string, DiagBlock | undefined>;
}

export function collectModelDiagnostics(model: ProjectModel): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [];
  const variableNames = new Set(model.variables.map((v) => v.name));

  for (const screen of model.screens) {
    if (screen.components.length === 0) {
      out.push({
        severity: "warning",
        message: `Screen “${screen.name}” is empty — drag components from the palette.`,
        screenId: screen.id,
      });
    }

    // Asset references are soft: an image whose "asset:<id>" no longer
    // resolves (the asset was deleted) renders as a broken source — flagged
    // here, never silently rewritten.
    const assetIds = new Set(model.assets.map((a) => a.id));
    const flat: { id: string; type: string; props?: Record<string, unknown> }[] = [];
    const walk = (nodes: typeof screen.components) => {
      for (const node of nodes) {
        flat.push({ id: node.id, type: node.type, props: node.props });
        if (node.children) walk(node.children);
      }
    };
    walk(screen.components);
    const componentIds = new Set(flat.map((c) => c.id));
    // Property references resolve across the whole model: the runtime seeds
    // state for every screen, so a handler on one screen may lawfully target
    // another screen's component (e.g. filling the results screen's score).
    const modelComponentIds = new Set<string>();
    for (const anyScreen of model.screens) {
      const walkAll = (nodes: typeof screen.components) => {
        for (const node of nodes) {
          modelComponentIds.add(node.id);
          if (node.children) walkAll(node.children);
        }
      };
      walkAll(anyScreen.components);
    }

    // Input actions (input abstraction system): honest diagnostics for the
    // three ways a scene's action set can be wrong. The default set always
    // satisfies the built-in player, so these only fire for edited sets.
    const playerComponent = flat.find((c) => c.type === "player");
    if (playerComponent && screen.inputActions?.length) {
      const actions = inputActionsOf(screen);
      const byId = new Map(actions.map((a) => [a.id, a]));
      const missing = [PLAYER_ACTION_LEFT, PLAYER_ACTION_RIGHT, PLAYER_ACTION_JUMP].filter(
        (id) => !byId.get(id)?.enabled,
      );
      if (missing.length > 0) {
        out.push({
          severity: "warning",
          message: `The built-in player controls expect the input actions “Move left”, “Move right” and “Jump” — “${missing.join("”, “")}” is missing or disabled, so the player will not respond. Rebind in the screen's Input Actions panel.`,
          screenId: screen.id,
          componentId: playerComponent.id,
        });
      }
      for (const action of actions) {
        if (action.enabled && action.keys.length === 0) {
          out.push({
            severity: "warning",
            message: `Input action “${action.name}” has no key binding — it will never fire. Add a binding in the screen's Input Actions panel.`,
            screenId: screen.id,
          });
        }
      }
      const keyOwners = new Map<string, string[]>();
      for (const action of actions) {
        if (!action.enabled) continue;
        for (const key of action.keys) {
          const owners = keyOwners.get(key) ?? [];
          owners.push(action.name);
          keyOwners.set(key, owners);
        }
      }
      for (const [key, owners] of keyOwners) {
        if (owners.length > 1) {
          out.push({
            severity: "info",
            message: `Key “${key}” is bound to multiple input actions (${owners.join(", ")}) — all of them fire at once. Rebind one in the Input Actions panel if that is unintended.`,
            screenId: screen.id,
          });
        }
      }
    }

    // Sprite animation state machine (SLICE 3): honest diagnostics for broken
    // references — the runtime never crashes and never invents replacements.
    // Applies to every texture-capable entity (sprite, player, enemy).
    // 3D foundation (TASK 51): the model derives every diagnostic — the
    // runtime falls back to a default camera and never crashes.
    if (model.type === "3d") {
      for (const screen of model.screens) {
        // TASK 53: hierarchy issues (self-parent, missing parent, cycles,
        // excessive depth) — the runtime evaluates broken branches as roots.
        const { issues } = computeWorldMatrices(screen.components);
        for (const issue of issues) {
          const component = screen.components.find((c) => c.id === issue.componentId);
          const name = String(component?.props?.name ?? issue.componentId);
          const message =
            issue.kind === "cycle"
              ? `“${name}” is part of a parent cycle — the branch is treated as a root until the parents are fixed.`
              : issue.kind === "self-parent"
                ? `“${name}” is parented to itself — pick a valid parent in the Hierarchy section.`
                : issue.kind === "missing-parent"
                  ? `“${name}” references a parent that no longer exists — it renders at its own position.`
                  : `“${name}” sits deeper than ${issue.detail.replace("deeper than ", "")} levels — the branch is treated as a root.`;
          out.push({
            severity: "warning",
            message,
            screenId: screen.id,
            componentId: issue.componentId,
          });
        }
        const cameras = screen.components.filter((c) => c.type === "camera3d");
        if (cameras.length === 0) {
          out.push({
            severity: "warning",
            message: `3D scene “${screen.name}” has no camera — the runtime uses a default view. Add a Camera in the 3D Objects palette.`,
            screenId: screen.id,
          });
          continue;
        }
        const active = cameras.filter((c) => c.props?.active === true);
        if (active.length === 0) {
          out.push({
            severity: "warning",
            message: `No active camera in “${screen.name}” — the runtime uses the first camera. Set Active in its Inspector.`,
            screenId: screen.id,
          });
        }
        for (const camera of cameras) {
          const fov = Number(camera.props?.fov);
          if (Number.isFinite(fov) && (fov < 20 || fov > 120)) {
            out.push({
              severity: "warning",
              message: `Camera field of view ${fov} is outside 20–120 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: camera.id,
            });
          }
          const near = Number(camera.props?.near);
          const far = Number(camera.props?.far);
          if (Number.isFinite(near) && Number.isFinite(far) && near >= far) {
            out.push({
              severity: "warning",
              message: `Camera near clip (${near}) must be smaller than the far clip (${far}).`,
              screenId: screen.id,
              componentId: camera.id,
            });
          }
        }

        // TASK 55: material + light diagnostics — the runtime clamps and
        // falls back safely; these point at values that will not do what
        // the user probably intended.
        for (const component of screen.components) {
          if (component.type === "cube3d" || component.type === "sphere3d" || component.type === "plane3d") {
            if (component.props?.color !== undefined && !isHexColor(component.props?.color)) {
              out.push({
                severity: "warning",
                message: `Base color “${component.props?.color}” is not a hex color — the material falls back to the default blue. Pick a color in the Material section.`,
                screenId: screen.id,
                componentId: component.id,
              });
            }
          }
          if (component.type !== "light3d") continue;
          const name = String(component.props?.name ?? component.id);
          if (component.props?.type !== undefined && component.props?.type !== "point" && component.props?.type !== "directional") {
            out.push({
              severity: "warning",
              message: `Light “${name}” has an unknown type (“${String(component.props?.type)}”) — the runtime treats it as a point light. Pick Point or Directional in the Inspector.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          if (component.props?.color !== undefined && !isHexColor(component.props?.color)) {
            out.push({
              severity: "warning",
              message: `Light “${name}” color “${component.props?.color}” is not a hex color — the runtime falls back to warm gold. Pick a color in the Inspector.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const intensity = Number(component.props?.intensity);
          if (component.props?.intensity !== undefined && (!Number.isFinite(intensity) || intensity < 0 || intensity > 5)) {
            out.push({
              severity: "warning",
              message: `Light “${name}” intensity ${component.props?.intensity} is outside 0–5 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const radius = Number(component.props?.radius);
          if (component.props?.radius !== undefined && (!Number.isFinite(radius) || radius < 0.1 || radius > 1000)) {
            out.push({
              severity: "warning",
              message: `Light “${name}” radius ${component.props?.radius} is outside 0.1–1000 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
        }
        const activeLights = screen.components.filter((c) => c.type === "light3d" && c.props?.enabled !== false).length;
        if (activeLights > 8) {
          out.push({
            severity: "warning",
            message: `“${screen.name}” has ${activeLights} enabled 3D lights — the renderer uses the first 8; the rest have no effect.`,
            screenId: screen.id,
          });
        }

        // TASK 57: character-controller diagnostics — configuration that will
        // not do what the user probably intended.
        const controllerEntities = screen.components.filter((c) => c.props?.controllerEnabled === true);
        if (controllerEntities.length > 1) {
          out.push({
            severity: "warning",
            message: `“${screen.name}” has ${controllerEntities.length} enabled player controllers — the runtime controls the first one (${String(controllerEntities[0]?.props?.name ?? controllerEntities[0]?.id ?? "")}). Disable the others in the Controller section.`,
            screenId: screen.id,
            componentId: controllerEntities[0]?.id,
          });
        }
        for (const component of controllerEntities) {
          const name = String(component.props?.name ?? component.id);
          const bodyType = component.props?.bodyType;
          const colliderType = component.props?.colliderType;
          if (bodyType !== "dynamic" || colliderType === undefined || colliderType === "none") {
            out.push({
              severity: "warning",
              message: `Player “${name}” has a controller but no dynamic physics body — set Body to Dynamic and pick a Collider in the Physics section, or the player cannot move or land.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          if (component.props?.gravityEnabled === false) {
            out.push({
              severity: "warning",
              message: `Player “${name}” has gravity disabled — it will never fall or land, so jumping cannot work. Enable Affected by gravity in the Physics section.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const moveSpeed = Number(component.props?.moveSpeed);
          if (component.props?.moveSpeed !== undefined && (!Number.isFinite(moveSpeed) || moveSpeed < 0.1 || moveSpeed > 100)) {
            out.push({
              severity: "warning",
              message: `Player “${name}” move speed ${component.props?.moveSpeed} is outside 0.1–100 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const jumpForce = Number(component.props?.jumpForce);
          if (component.props?.jumpForce !== undefined && (!Number.isFinite(jumpForce) || jumpForce < 0 || jumpForce > 50)) {
            out.push({
              severity: "warning",
              message: `Player “${name}” jump force ${component.props?.jumpForce} is outside 0–50 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const acceleration = Number(component.props?.acceleration);
          if (component.props?.acceleration !== undefined && (!Number.isFinite(acceleration) || acceleration < 0 || acceleration > 200)) {
            out.push({
              severity: "warning",
              message: `Player “${name}” acceleration ${component.props?.acceleration} is outside 0–200 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const deceleration = Number(component.props?.deceleration);
          if (component.props?.deceleration !== undefined && (!Number.isFinite(deceleration) || deceleration < 0 || deceleration > 200)) {
            out.push({
              severity: "warning",
              message: `Player “${name}” deceleration ${component.props?.deceleration} is outside 0–200 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
          const airControl = Number(component.props?.airControl);
          if (component.props?.airControl !== undefined && (!Number.isFinite(airControl) || airControl < 0 || airControl > 1)) {
            out.push({
              severity: "warning",
              message: `Player “${name}” air control ${component.props?.airControl} is outside 0–1 — the runtime clamps it.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
        }
        if (controllerEntities.length === 0) {
          out.push({
            severity: "info",
            message: `“${screen.name}” has no player controller — the scene renders normally, but nothing is player-controlled. Enable Controller on a 3D entity to make it the player.`,
            screenId: screen.id,
          });
        }
        const ambient3D = Number(screen.styles?.ambientIntensity);
        if (screen.styles?.ambientIntensity !== undefined && (!Number.isFinite(ambient3D) || ambient3D < 0 || ambient3D > 1)) {
          out.push({
            severity: "warning",
            message: `Ambient intensity ${screen.styles?.ambientIntensity} is outside 0–1 — the runtime clamps it. Fix it in the screen's Appearance section.`,
            screenId: screen.id,
          });
        }
      }
    }

    // Lighting (SYSTEM 5): malformed light configuration — the runtime clamps
    // everything safely, these point at values that will not do what the user
    // probably intended.
    for (const component of flat) {
      if (component.type === "light") {
        const intensity = Number(component.props?.intensity);
        const radius = Number(component.props?.radius);
        if (!Number.isFinite(intensity) || intensity < 0 || intensity > 5) {
          out.push({
            severity: "warning",
            message: `Light intensity ${component.props?.intensity} is outside 0–5 — the runtime clamps it, but set a value in range in the Light's Inspector.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
        if (!Number.isFinite(radius) || radius < 8 || radius > 2000) {
          out.push({
            severity: "warning",
            message: `Light radius ${component.props?.radius} is outside 8–2000 — the runtime clamps it, but set a value in range in the Light's Inspector.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
        if (!isHexColor(component.props?.color)) {
          out.push({
            severity: "warning",
            message: `Light color “${component.props?.color}” is not a hex color — the runtime falls back to warm white. Pick a color in the Light's Inspector.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
      }
    }
    if (isSceneScreen(screen)) {
      const ambientIntensity = Number(screen.styles?.ambientIntensity);
      if (screen.styles?.ambientIntensity !== undefined && (!Number.isFinite(ambientIntensity) || ambientIntensity < 0 || ambientIntensity > 1)) {
        out.push({
          severity: "warning",
          message: `Ambient intensity ${screen.styles?.ambientIntensity} is outside 0–1 — the runtime clamps it. Fix it in the screen's Appearance section.`,
          screenId: screen.id,
        });
      }
    }

    // Particle emitters (SYSTEM 18): malformed configuration — the runtime
    // clamps safely; these point at values that will not do what intended.
    for (const component of flat) {
      if (component.type !== "emitter") continue;
      const rate = Number(component.props?.emissionRate);
      const lifetime = Number(component.props?.lifetime);
      const maxParticles = Number(component.props?.maxParticles);
      if (!Number.isFinite(rate) || rate < 0 || rate > 500) {
        out.push({
          severity: "warning",
          message: `Emitter emission rate ${component.props?.emissionRate} is outside 0–500/s — the runtime clamps it.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
      if (!Number.isFinite(lifetime) || lifetime < 0.05 || lifetime > 30) {
        out.push({
          severity: "warning",
          message: `Emitter lifetime ${component.props?.lifetime} is outside 0.05–30s — the runtime clamps it.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
      if (!Number.isFinite(maxParticles) || maxParticles < 1 || maxParticles > 1000) {
        out.push({
          severity: "warning",
          message: `Emitter max particles ${component.props?.maxParticles} is outside 1–1000 — the runtime clamps it.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
      if (!isHexColor(component.props?.color)) {
        out.push({
          severity: "warning",
          message: `Emitter color “${component.props?.color}” is not a hex color — the runtime falls back to warm gold.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
    }

    // 3D physics (TASK 54): out-of-range body configuration — the runtime
    // clamps safely; these point at values that will not do what intended.
    for (const component of flat) {
      if (component.type !== "cube3d" && component.type !== "sphere3d" && component.type !== "plane3d") continue;
      const bodyType = component.props?.bodyType;
      if (bodyType !== "static" && bodyType !== "dynamic") continue;
      const mass = Number(component.props?.mass);
      if (component.props?.mass !== undefined && (!Number.isFinite(mass) || mass < 0.01 || mass > 10000)) {
        out.push({
          severity: "warning",
          message: `Mass ${component.props?.mass} is outside 0.01–10000 — the runtime clamps it, but set a value in range in the Physics section of the Inspector.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
      for (const key of ["colliderSizeX", "colliderSizeY", "colliderSizeZ", "colliderRadius"] as const) {
        const value = Number(component.props?.[key]);
        if (component.props?.[key] !== undefined && (!Number.isFinite(value) || value < 0.01 || value > 1000)) {
          out.push({
            severity: "warning",
            message: `Collider ${key} ${component.props?.[key]} is outside 0.01–1000 — the runtime clamps it, but set a value in range in the Physics section of the Inspector.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
      }
    }

    for (const component of flat) {
      if (component.type !== "sprite" && component.type !== "player" && component.type !== "enemy") continue;
      const machine = parseAnimator(component.props?.animator);
      if (!machine) continue;
      const clips = new Set(parseAnimations(component.props?.animations).map((c) => c.id));
      const stateIds = new Set(machine.states.map((s) => s.id));
      const knownParams = new Set([
        ...machine.params.map((p) => p.name),
        ...Object.keys(ANIMATOR_BUILTIN_PARAMS),
      ]);
      for (const state of machine.states) {
        if (!clips.has(state.clip)) {
          out.push({
            severity: "warning",
            message: `Animation state “${state.name}” references the clip “${state.clip}”, which does not exist on this sprite — the state keeps the previous animation until you fix it in the Animation section.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
      }
      if (!stateIds.has(machine.defaultId)) {
        out.push({
          severity: "warning",
          message: `The state machine's default state no longer exists — the runtime falls back to the first state.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
      for (const transition of machine.transitions) {
        for (const ref of [transition.from, transition.to]) {
          if (ref !== "*" && !stateIds.has(ref)) {
            out.push({
              severity: "warning",
              message: `A transition references the state “${ref}”, which no longer exists — this transition never fires. Fix or delete it in the state machine.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
        }
        for (const cond of transition.conds) {
          if (!knownParams.has(cond.name)) {
            out.push({
              severity: "warning",
              message: `A transition condition reads the parameter “${cond.name}”, which does not exist — it counts as false. Add the parameter or fix the condition.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
        }
      }
    }

    for (const component of flat) {
      if (component.type !== "image") continue;
      const src = component.props?.src;
      if (typeof src === "string" && src.startsWith("asset:")) {
        const assetId = src.slice(6);
        if (assetId !== "" && !assetIds.has(assetId)) {
          out.push({
            severity: "warning",
            message: `Image references an asset that is no longer in the project. Pick another in the Assets panel.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
      }
    }

    // Camera checks (TASK 14): the follow target must resolve to a real
    // component, and inverted bounds would be undefined behavior — flagged
    // here; the runtime itself normalizes them, never crashes.
    for (const component of flat) {
      if (component.type === "camera") {
        const target = component.props?.followTarget;
        if (typeof target === "string" && target !== "" && !modelComponentIds.has(target)) {
          out.push({
            severity: "error",
            message: `Camera target “${target}” no longer exists. Pick another entity in the Camera's Inspector, or set Target entity to None.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
        if (component.props?.boundsEnabled === true) {
          const minX = component.props?.minX;
          const maxX = component.props?.maxX;
          const minY = component.props?.minY;
          const maxY = component.props?.maxY;
          const xInverted = typeof minX === "number" && typeof maxX === "number" && minX > maxX;
          const yInverted = typeof minY === "number" && typeof maxY === "number" && minY > maxY;
          if (xInverted || yInverted) {
            out.push({
              severity: "warning",
              message: `Camera bounds are inverted (min greater than max) — the runtime swaps them, but fix them in the Camera's Inspector.`,
              screenId: screen.id,
              componentId: component.id,
            });
          }
        }
      }
      // Sorting layers (TASK 15): a component pointing at a deleted/renamed
      // layer renders with the World layer — never silently invisible.
      if (
        component.type !== "camera" &&
        hasUnknownSortingLayer(screen, { id: component.id, type: component.type, props: component.props })
      ) {
        out.push({
          severity: "warning",
          message: `Sorting layer “${component.props?.sortingLayer}” no longer exists — this ${component.type} renders on the World layer. Pick a layer in its Inspector.`,
          screenId: screen.id,
          componentId: component.id,
        });
      }
    }

    for (const handler of screen.logic?.handlers ?? []) {
      const where =
        handler.componentId === null
          ? "Screen"
          : componentIds.has(handler.componentId)
            ? `Component ${handler.componentId}`
            : null;

      if (handler.body.length === 0) {
        out.push({
          severity: "info",
          message: `${where ?? "Handler"} has no blocks yet — the ${handler.event} event does nothing.`,
          screenId: screen.id,
          handlerId: handler.id,
        });
      }

      if (handler.componentId !== null && !componentIds.has(handler.componentId)) {
        out.push({
          severity: "error",
          message: `This handler references a deleted component. Reconnect it in Blocks or delete the handler.`,
          screenId: screen.id,
          handlerId: handler.id,
          blockId: handler.body[0]?.id,
          componentId: handler.componentId,
        });
      }

      // Input abstraction: a handler may react to an input action by ID; if
      // that action is deleted or disabled the handler silently stops firing
      // — flagged here, never silently rewired to a different action.
      if (handler.event.startsWith("action-pressed-")) {
        const actionId = handler.event.slice("action-pressed-".length);
        const action = inputActionsOf(screen).find((a) => a.id === actionId);
        if (!action) {
          out.push({
            severity: "warning",
            message: `This handler reacts to the input action “${actionId}”, which no longer exists — it will never fire. Re-add the action in the screen's Input Actions panel or delete this handler.`,
            screenId: screen.id,
            handlerId: handler.id,
          });
        } else if (!action.enabled) {
          out.push({
            severity: "warning",
            message: `Input action “${action.name}” is disabled — this handler will not fire while it stays disabled.`,
            screenId: screen.id,
            handlerId: handler.id,
          });
        }
      }

      const checkBlock = (block: DiagBlock): void => {
        // TASK 64: extension blocks are saved references, never bundled code.
        // The model alone cannot know the install state, so the diagnostic is
        // an honest reminder (the preview reports the skip at run time).
        if (block.type.startsWith("ext:")) {
          out.push({
            severity: "info",
            message: `Extension block "${block.type}" runs only while its extension is installed and enabled — the preview reports a skip when it can't run.`,
            screenId: screen.id,
            handlerId: handler.id,
            blockId: block.id,
          });
        }
        if (block.type === "navigate") {
          const target = block.inputs?.screenId;
          if (typeof target === "string" && target !== "" && !model.screens.some((s) => s.id === target)) {
            out.push({
              severity: "error",
              message: `Navigate targets a screen that does not exist.`,
              screenId: screen.id,
              handlerId: handler.id,
              blockId: block.id,
            });
          }
        }
        if (block.type === "set-property" || block.type === "get-property") {
          const componentId = block.inputs?.componentId;
          if (typeof componentId === "string" && componentId !== "" && !modelComponentIds.has(componentId)) {
            out.push({
              severity: "error",
              message: `${block.type === "set-property" ? "Set" : "Get"} property references a deleted component.`,
              screenId: screen.id,
              handlerId: handler.id,
              blockId: block.id,
              componentId,
            });
          }
        }
        if (block.type === "set-variable" || block.type === "get-variable") {
          const name = block.inputs?.name;
          if (typeof name === "string" && name !== "" && !variableNames.has(name)) {
            out.push({
              severity: "error",
              message: `Variable “${name}” does not exist — create it in the Variables panel.`,
              screenId: screen.id,
              handlerId: handler.id,
              blockId: block.id,
            });
          }
        }
        for (const child of block.children ?? []) checkBlock(child);
        for (const child of block.elseChildren ?? []) checkBlock(child);
        for (const slot of Object.values(block.slots ?? {})) {
          if (slot) checkBlock(slot);
        }
      };

      for (const block of handler.body) checkBlock(block);
    }
  }

  return out;
}
