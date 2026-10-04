"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { eventsFor, getDef, EVENT_LABELS, type FieldDef } from "@/lib/project-model/registry";
import { genId, locateComponent } from "@/lib/project-model/ops";
import {
  DEFAULT_SORTING_LAYER,
  animatorConditionsToString,
  animatorToString,
  animationsToString,
  clipFrameIndex,
  entitiesOnLayer,
  inputActionsOf,
  isSceneScreen,
  parseAnimator,
  parseAnimatorConditions,
  parseAnimations,
  parseInputKeys,
  PLAYER_ACTION_JUMP,
  PLAYER_ACTION_LEFT,
  PLAYER_ACTION_RIGHT,
  sortingLayersOf,
  type AnimClip,
  type AnimatorMachine,
  type AnimatorParam,
  type AnimatorParamType,
 } from "@/lib/project-model/scene";
import type { ProjectModelComponent, ProjectModelScreen } from "@/types/project";
import { assetApi, imageUrl, type ProjectAsset } from "@/lib/api";
import { computeWorldMatrices, descendantsOf3D } from "@/lib/hierarchy3d";
import { mat4TransformPoint } from "@/lib/render3d";
import { useBuilder } from "./builder-context";
import { IconCopy, IconTrash } from "@/components/visuals/icons";
import type { ProjectModelInputAction, ProjectModelSortingLayer, PropsMap } from "@/types/project";

/**
 * The properties inspector for the selected component — or, when nothing is
 * selected, the active screen's presentation. Only fields relevant to the
 * selected type are shown; every edit commits to the canonical model.
 */
export function Inspector() {
  const { model, selectedId, activeScreenId } = useBuilder();

  if (!selectedId) {
    return <ScreenInspector screenId={activeScreenId} />;
  }

  const location = locateComponent(model, selectedId);
  if (!location) {
    return (
      <p className="px-3 py-4 text-[12px] text-mist">
        The selected component is no longer in the model.
      </p>
    );
  }

  return <ComponentInspector nodeId={selectedId} />;
}

// ---- screen inspector -----------------------------------------------------------

function ScreenInspector({ screenId }: { screenId: string }) {
  const { model, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === screenId);
  if (!screen) return null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <Section title="Screen">
        <StaticRow label="Name" value={screen.name} />
        <StaticRow label="ID" value={screen.id} mono />
        <StaticRow label="Components" value={String(screen.components.length)} />
      </Section>
      <Section title="Appearance">
        <ColorField
          label="Background"
          value={typeof screen.styles?.background === "string" ? screen.styles.background : "#ffffff"}
          onChange={(value) => actions.updateScreenStyles(screenId, { background: value })}
        />
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-[12px] text-fog">Scrollable screen</span>
          <input
            type="checkbox"
            checked={screen.styles?.scrollable === true}
            onChange={(event) => actions.updateScreenStyles(screenId, { scrollable: event.target.checked })}
            className="h-4 w-4 accent-[#8f7bff]"
          />
        </label>
        {isSceneScreen(screen) ? (
          <>
            <p className="px-1 pt-2 text-[10px] font-mono uppercase tracking-[0.14em] text-mist">Ambient light</p>
            <ColorField
              label="Ambient color"
              value={typeof screen.styles?.ambientColor === "string" ? screen.styles.ambientColor : model.type === "3d" ? "#ffffff" : "#000010"}
              onChange={(value) => actions.updateScreenStyles(screenId, { ambientColor: value })}
            />
            <TextField
              label="Ambient intensity (0–1)"
              value={typeof screen.styles?.ambientIntensity === "number" ? String(screen.styles.ambientIntensity) : "1"}
              numeric={{ min: 0, max: 1, decimals: true }}
              onCommit={(value) => actions.updateScreenStyles(screenId, { ambientIntensity: typeof value === "number" ? value : 1 })}
            />
            <p className="px-1 text-[10.5px] leading-4 text-mist">
              1 keeps the scene at normal brightness; lower values darken the
              world so point lights stand out. Add Light entities for local
              illumination{model.type === "3d" ? " — 3D scenes light every face from the Light's color, intensity and position" : ""}.
            </p>
            <p className="px-1 pt-2 text-[10px] font-mono uppercase tracking-[0.14em] text-mist">Scene gravity</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["gravityX", "gravityY", "gravityZ"] as const).map((key, index) => {
                const fallback = ["0", "-9.81", "0"][index] ?? "0";
                return (
                  <TextField
                    key={key}
                    label={`Gravity ${["X", "Y", "Z"][index]}`}
                    value={typeof screen.styles?.[key] === "number" ? String(screen.styles[key]) : fallback}
                    numeric={{ min: -100, max: 100, decimals: true }}
                    onCommit={(value) => actions.updateScreenStyles(screenId, { [key]: typeof value === "number" ? value : [0, -9.81, 0][index] })}
                  />
                );
              })}
            </div>
            <p className="px-1 text-[10.5px] leading-4 text-mist">
              Applies to dynamic 3D physics bodies. The conventional default is
              −9.81 on Y.
            </p>
          </>
        ) : null}
      </Section>
      {isSceneScreen(screen) ? (
        <SortingLayerManager screenId={screenId} />
      ) : null}
      {isSceneScreen(screen) ? (
        <InputActionsPanel screenId={screenId} />
      ) : null}
      <p className="px-1 text-[11px] leading-5 text-mist">
        Select a component on the canvas or in the tree to edit its properties.
      </p>
    </div>
  );
}

// ---- input actions (input abstraction system) -------------------------------------

/**
 * The scene's Input Actions panel: the abstract actions gameplay reasons
 * about, each with its key bindings. The three built-in player actions
 * (move-left / move-right / jump) are marked; editing their bindings
 * rebinds the player controls, removing or disabling one disables that
 * control (a diagnostic warns). Every edit is one undoable commit through
 * the standard actions path; an empty list restores the default set.
 */
function InputActionsPanel({ screenId }: { screenId: string }) {
  const { model, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  const actionsList = inputActionsOf(screen);
  const isCustom = Boolean(screen.inputActions?.length);
  const builtinIds = new Set([PLAYER_ACTION_LEFT, PLAYER_ACTION_RIGHT, PLAYER_ACTION_JUMP]);

  const commit = (next: ProjectModelInputAction[]) =>
    actions.updateInputActions(screenId, next);

  const rename = (index: number, name: string) => {
    const trimmed = name.trim();
    const current = actionsList[index];
    if (!current || trimmed === "" || trimmed === current.name) return;
    commit(actionsList.map((a, i) => (i === index ? { ...a, name: trimmed } : a)));
  };

  const rebind = (index: number, raw: string) => {
    const keys = parseInputKeys(raw);
    const current = actionsList[index];
    if (!current || keys.join(",") === current.keys.join(",")) return;
    commit(actionsList.map((a, i) => (i === index ? { ...a, keys } : a)));
  };

  const toggle = (index: number, enabled: boolean) => {
    commit(actionsList.map((a, i) => (i === index ? { ...a, enabled } : a)));
  };

  const add = () => {
    let name = "New action";
    for (let n = 2; actionsList.some((a) => a.name === name); n += 1) name = `New action ${n}`;
    commit([...actionsList, { id: genId("act"), name, keys: [], enabled: true }]);
  };

  const remove = (index: number) => {
    commit(actionsList.filter((_, i) => i !== index));
  };

  return (
    <Section title="Input actions">
      <p className="px-1 pb-2 text-[11px] leading-4 text-mist">
        The player reacts to actions, not keys — bind keys here. The built-in
        player controls use Move left, Move right and Jump.{" "}
        {isCustom
          ? "Remove every action to restore the default set."
          : "Defaults are active; editing them stores this scene's own set."}
      </p>
      <ul className="flex flex-col gap-1">
        {actionsList.map((action, index) => (
          <li key={action.id} className="flex flex-col gap-1 rounded-lg border border-line bg-card px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={action.enabled}
                aria-label={`Enable ${action.name}`}
                onChange={(event) => toggle(index, event.target.checked)}
                className="h-4 w-4 shrink-0 accent-[#8f7bff]"
              />
              <input
                defaultValue={action.name}
                aria-label={`Action name for ${action.name}`}
                onBlur={(event) => rename(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  event.stopPropagation();
                }}
                className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              />
              {builtinIds.has(action.id) ? (
                <span
                  title="One of the three actions the built-in player controls consume"
                  className="shrink-0 rounded border border-line px-1 py-0.5 font-mono text-[9.5px] text-mist"
                >
                  built-in
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Delete action ${action.name}`}
                title={`Delete ${action.name}${builtinIds.has(action.id) ? " — the player loses this control" : ""}`}
                onClick={() => remove(index)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-1.5 pl-6">
              <span className="shrink-0 font-mono text-[10px] text-mist">keys</span>
              <input
                defaultValue={action.keys.join(", ")}
                aria-label={`Keys for ${action.name}`}
                placeholder="e.g. j, shift"
                onBlur={(event) => rebind(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  event.stopPropagation();
                }}
                className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              />
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-2 h-7 w-full rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        + Add action
      </button>
    </Section>
  );
}

// ---- sorting layers (TASK 15) -----------------------------------------------------

/**
 * The scene's Layer Manager: named rendering layers, listed back-to-front.
 * Add, rename (entity references remap in the same commit), reorder, and
 * delete — a layer currently used by entities cannot be deleted, so no
 * entity is ever left pointing at a missing layer. Every edit is one
 * undoable commit through the standard actions path.
 */
function SortingLayerManager({ screenId }: { screenId: string }) {
  const { model, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  const layers = sortingLayersOf(screen);
  const previous = screen.sortingLayers?.length ? screen.sortingLayers : undefined;
  const usedCounts = new Map(layers.map((l) => [l.name, entitiesOnLayer(screen, l.name)]));
  const maxOrder = layers.reduce((max, l) => Math.max(max, l.order), 0);

  const commit = (next: ProjectModelSortingLayer[]) =>
    actions.updateSortingLayers(screenId, next, previous);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= layers.length) return;
    const moved = layers[index];
    const neighbor = layers[target];
    if (!moved || !neighbor) return;
    // The list is displayed (and sorted) by ORDER, so moving a layer means
    // exchanging semantic positions with its neighbor: swap the order values.
    // Equal orders nudge the moved layer past its neighbor.
    const equal = moved.order === neighbor.order;
    commit(layers.map((l, i) => {
      if (i === index) {
        return { ...l, order: equal ? neighbor.order + (direction === -1 ? -5 : 5) : neighbor.order };
      }
      if (i === target) {
        return { ...l, order: equal ? moved.order + (direction === -1 ? 5 : -5) : moved.order };
      }
      return l;
    }));
  };

  const rename = (index: number, name: string) => {
    const trimmed = name.trim();
    const current = layers[index];
    if (!current || trimmed === "" || trimmed === current.name) return;
    if (layers.some((l) => l.name === trimmed)) return; // names are the reference
    const next = layers.map((l, i) => (i === index ? { ...l, name: trimmed } : l));
    commit(next);
  };

  const add = () => {
    let name = "New layer";
    for (let n = 2; layers.some((l) => l.name === name); n += 1) name = `New layer ${n}`;
    commit([...layers, { name, order: maxOrder + 100 }]);
  };

  const remove = (index: number) => {
    const layer = layers[index];
    if (!layer || (usedCounts.get(layer.name) ?? 0) > 0) return;
    commit(layers.filter((_, i) => i !== index));
  };

  return (
    <Section title="Rendering layers">
      <p className="px-1 pb-2 text-[11px] leading-4 text-mist">
        Objects on higher layers are drawn in front of lower ones. Assign each
        entity a layer in its Inspector; Order sorts within a layer.
      </p>
      <ul className="flex flex-col gap-1">
        {layers.map((layer, index) => {
          const inUse = usedCounts.get(layer.name) ?? 0;
          return (
            <li key={layer.name} className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5">
              <span className="w-9 shrink-0 text-center font-mono text-[10px] text-mist">{layer.order}</span>
              <input
                defaultValue={layer.name}
                aria-label={`Layer name for ${layer.name}`}
                onBlur={(event) => rename(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  event.stopPropagation();
                }}
                className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              />
              {inUse > 0 ? (
                <span
                  title={`${inUse} ${inUse === 1 ? "entity uses" : "entities use"} this layer`}
                  className="rounded border border-line px-1 py-0.5 font-mono text-[9.5px] text-mist"
                >
                  {inUse}×
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Move ${layer.name} behind`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${layer.name} in front`}
                disabled={index === layers.length - 1}
                onClick={() => move(index, 1)}
                className="flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Delete layer ${layer.name}`}
                disabled={inUse > 0}
                title={inUse > 0 ? `In use by ${inUse} ${inUse === 1 ? "entity" : "entities"} — reassign them first.` : "Delete this layer"}
                onClick={() => remove(index)}
                className="flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-mist"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-2 h-7 w-full rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        + Add layer
      </button>
    </Section>
  );
}

// ---- sprite animation (SLICE 2) ---------------------------------------------------

/**
 * The sprite's Animation panel: clips (name, fps, loop, ordered asset frames)
 * stored in the canonical `animations` prop; the active clip id in `animation`
 * is what the runtimes play on run start. Frames reference the project's real
 * assets — the same refs a sprite's Texture uses. The Play/Pause/Restart
 * preview is EDITOR-LOCAL (a small rAF loop); runtime playback state never
 * touches the model. Every edit is one undoable commit.
 */
function AnimationPanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { project, actions } = useBuilder();
  const clips = parseAnimations(props?.animations);
  const activeId = String(props?.animation ?? "");
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [pendingFrame, setPendingFrame] = useState<string>("");
  const [previewClipId, setPreviewClipId] = useState<string>(activeId || clips[0]?.id || "");
  const [preview, setPreview] = useState<{ playing: boolean; elapsed: number }>({ playing: false, elapsed: 0 });
  const previewRef = useRef(preview);
  previewRef.current = preview;

  useEffect(() => {
    let cancelled = false;
    if (project?.id) {
      assetApi
        .list(project.id)
        .then(({ assets: list }) => {
          if (!cancelled) setAssets(list.filter((a) => a.mime.startsWith("image/")));
        })
        .catch(() => setAssets([]));
    }
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  // Editor-local playback preview: rAF at the clip's fps — never the model.
  useEffect(() => {
    if (!preview.playing) return;
    const clip = clips.find((c) => c.id === previewClipId);
    if (!clip || clip.frames.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPreview((s) => ({ playing: true, elapsed: s.elapsed + dt }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clips list is stable per selection
  }, [preview.playing, previewClipId, props?.animations]);

  const commit = (next: AnimClip[]) =>
    actions.updateProps(nodeId, { animations: animationsToString(next) });

  const activeClip = clips.find((c) => c.id === previewClipId) ?? clips[0] ?? null;
  const previewFrame = activeClip && activeClip.frames.length > 0
    ? activeClip.frames[
        preview.playing
          ? clipFrameIndex(activeClip, previewRef.current.elapsed) % Math.max(1, activeClip.frames.length)
          : 0
      ]
    : null;

  const setClip = (index: number, patch: Partial<AnimClip>) => {
    commit(clips.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const addClip = () => {
    let name = "Clip";
    for (let n = 2; clips.some((c) => c.name === name); n += 1) name = `Clip ${n}`;
    const id = genId("anim");
    commit([...clips, { id, name, fps: 8, loop: true, frames: [] }]);
    setPreviewClipId(id);
    actions.updateProps(nodeId, { animation: id });
  };

  const removeClip = (index: number) => {
    const removed = clips[index];
    const next = clips.filter((_, i) => i !== index);
    commit(next);
    if (activeId === removed?.id) {
      actions.updateProps(nodeId, { animation: next[0]?.id ?? "" });
      setPreviewClipId(next[0]?.id ?? "");
    }
  };

  const moveFrame = (clipIndex: number, frameIndex: number, direction: -1 | 1) => {
    const clip = clips[clipIndex];
    const target = frameIndex + direction;
    if (!clip || target < 0 || target >= clip.frames.length) return;
    const frames = [...clip.frames];
    const [moved] = frames.splice(frameIndex, 1);
    frames.splice(target, 0, moved!);
    setClip(clipIndex, { frames });
  };

  const removeFrame = (clipIndex: number, frameIndex: number) => {
    const clip = clips[clipIndex];
    if (!clip) return;
    setClip(clipIndex, { frames: clip.frames.filter((_, i) => i !== frameIndex) });
  };

  const addFrame = (clipIndex: number, ref: string) => {
    const clip = clips[clipIndex];
    if (!clip || ref.trim() === "") return;
    setClip(clipIndex, { frames: [...clip.frames, ref.trim()] });
  };

  return (
    <Section title="Animation">
      {clips.length === 0 ? (
        <p className="px-1 pb-2 text-[11px] leading-4 text-mist">
          No clips yet. A clip is an ordered list of asset frames played at a
          fixed rate — the active clip plays when the game runs.
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {clips.map((clip, index) => {
          const isActive = activeId === clip.id;
          return (
            <li key={clip.id} className={`flex flex-col gap-1.5 rounded-lg border px-2 py-1.5 ${isActive ? "border-violet/60 bg-violet/[0.06]" : "border-line bg-card"}`}>
              <div className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`active-clip-${nodeId}`}
                  checked={isActive}
                  onChange={() => actions.updateProps(nodeId, { animation: clip.id })}
                  aria-label={`Make ${clip.name} the active animation`}
                  title="The active animation plays when the game runs"
                  className="h-3.5 w-3.5 shrink-0 accent-[#8f7bff]"
                />
                <input
                  defaultValue={clip.name}
                  aria-label={`Name for animation ${clip.name}`}
                  onBlur={(event) => {
                    const v = event.target.value.trim();
                    if (v && v !== clip.name) setClip(index, { name: v });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    event.stopPropagation();
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                <button
                  type="button"
                  aria-label={`Delete animation ${clip.name}`}
                  onClick={() => removeClip(index)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5 pl-5">
                <span className="shrink-0 font-mono text-[10px] text-mist">fps</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={clip.fps}
                  aria-label={`FPS for animation ${clip.name}`}
                  onBlur={(event) => {
                    const fps = Math.round(Number(event.target.value));
                    if (Number.isFinite(fps) && fps >= 1 && fps <= 60 && fps !== clip.fps) setClip(index, { fps });
                  }}
                  className="h-7 w-14 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                <label className="flex items-center gap-1 text-[11px] text-fog">
                  <input
                    type="checkbox"
                    checked={clip.loop}
                    onChange={(event) => setClip(index, { loop: event.target.checked })}
                    aria-label={`Loop animation ${clip.name}`}
                    className="h-3.5 w-3.5 accent-[#8f7bff]"
                  />
                  Loop
                </label>
                <span className="ml-auto font-mono text-[10px] text-mist">{clip.frames.length} frames</span>
              </div>
              {clip.frames.length > 0 ? (
                <div className="flex flex-wrap gap-1 pl-5">
                  {clip.frames.map((frame, frameIndex) => (
                    <span key={`${frame}-${frameIndex}`} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- project asset or user URL */}
                      <img
                        src={imageUrl(frame)}
                        alt=""
                        className="h-10 w-10 rounded border border-line bg-panel object-fill"
                        style={{ imageRendering: "pixelated" }}
                      />
                      <span className="absolute -top-1 -left-1 flex">
                        <button
                          type="button"
                          aria-label={`Move frame ${frameIndex + 1} of ${clip.name} earlier`}
                          disabled={frameIndex === 0}
                          onClick={() => moveFrame(index, frameIndex, -1)}
                          className="flex h-4 w-4 items-center justify-center rounded bg-panel text-[9px] text-fog hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move frame ${frameIndex + 1} of ${clip.name} later`}
                          disabled={frameIndex === clip.frames.length - 1}
                          onClick={() => moveFrame(index, frameIndex, 1)}
                          className="flex h-4 w-4 items-center justify-center rounded bg-panel text-[9px] text-fog hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove frame ${frameIndex + 1} of ${clip.name}`}
                        onClick={() => removeFrame(index, frameIndex)}
                        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded bg-panel text-[9px] text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="pl-5 text-[10.5px] text-mist">No frames — add one from the project's assets below.</p>
              )}
              <div className="flex items-center gap-1.5 pl-5">
                <select
                  aria-label={`Add frame to ${clip.name}`}
                  value={pendingFrame}
                  onChange={(event) => setPendingFrame(event.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-1.5 text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  <option value="">add frame from assets…</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={`asset:${asset.id}`}>
                      {asset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pendingFrame === ""}
                  onClick={() => {
                    addFrame(index, pendingFrame);
                    setPendingFrame("");
                  }}
                  className="h-7 shrink-0 rounded-md border border-line px-2 text-[11px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
                >
                  + Frame
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={addClip}
        className="mt-2 h-7 w-full rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        + Add clip
      </button>
      {activeClip ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-card px-2 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- project asset or user URL */}
          <img
            src={previewFrame ? imageUrl(previewFrame) : undefined}
            alt=""
            className="h-12 w-12 rounded border border-line bg-panel object-fill"
            style={{ imageRendering: "pixelated" }}
          />
          <span className="font-mono text-[10px] text-mist">
            {preview.playing ? "playing" : "stopped"} · {activeClip.fps} fps{activeClip.loop ? "" : " · once"}
          </span>
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              aria-label={preview.playing ? "Pause preview" : "Play preview"}
              onClick={() => setPreview((s) => ({ playing: !s.playing, elapsed: s.playing ? s.elapsed : 0 }))}
              className="flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {preview.playing ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              aria-label="Restart preview"
              onClick={() => setPreview({ playing: true, elapsed: 0 })}
              className="flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              ↺
            </button>
          </span>
        </div>
      ) : null}
    </Section>
  );
}

// ---- sprite animation state machine (SLICE 3) -------------------------------------

/** Entity types whose textures the animation system drives. */
const ANIMATION_ENTITY_TYPES = new Set(["sprite", "player", "enemy"]);

/**
 * TASK 54: the 3D physics inspector — body type, collider type/dimensions,
 * trigger, gravity, mass. All values are canonical props; numeric inputs are
 * sanitized by the number field (bounds mirror the runtime clamps).
 */
function Physics3DPanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { actions } = useBuilder();
  const set = (patch: PropsMap) => actions.updateProps(nodeId, patch);
  const bodyType = typeof props?.bodyType === "string" ? props.bodyType : "none";
  const colliderType = typeof props?.colliderType === "string" ? props.colliderType : "none";

  return (
    <Section title="Physics">
      <label className="flex flex-col gap-1 py-0.5">
        <span className="text-[12px] text-fog">Body</span>
        <select
          value={bodyType}
          aria-label="Body type"
          onChange={(event) => set({ bodyType: event.target.value })}
          className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <option value="none">None</option>
          <option value="static">Static</option>
          <option value="dynamic">Dynamic</option>
        </select>
      </label>
      {bodyType !== "none" ? (
        <>
          <label className="flex flex-col gap-1 py-0.5">
            <span className="text-[12px] text-fog">Collider</span>
            <select
              value={colliderType}
              aria-label="Collider type"
              onChange={(event) => set({ colliderType: event.target.value })}
              className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              <option value="none">None</option>
              <option value="box">Box</option>
              <option value="sphere">Sphere</option>
            </select>
          </label>
          {colliderType === "box" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {(["colliderSizeX", "colliderSizeY", "colliderSizeZ"] as const).map((key, index) => (
                <TextField
                  key={key}
                  label={`Size ${["X", "Y", "Z"][index]}`}
                  value={typeof props?.[key] === "number" ? String(props[key]) : "1"}
                  numeric={{ min: 0.01, max: 1000, decimals: true }}
                  onCommit={(value) => set({ [key]: typeof value === "number" ? value : 1 })}
                />
              ))}
            </div>
          ) : null}
          {colliderType === "sphere" ? (
            <TextField
              label="Collider radius"
              value={typeof props?.colliderRadius === "number" ? String(props.colliderRadius) : "0.5"}
              numeric={{ min: 0.01, max: 1000, decimals: true }}
              onCommit={(value) => set({ colliderRadius: typeof value === "number" ? value : 0.5 })}
            />
          ) : null}
          <label className="flex items-center justify-between gap-2 py-1">
            <span className="text-[12px] text-fog">Trigger (no physical response)</span>
            <input
              type="checkbox"
              checked={props?.isTrigger === true}
              onChange={(event) => set({ isTrigger: event.target.checked })}
              aria-label="Trigger collider"
              className="h-4 w-4 accent-[#8f7bff]"
            />
          </label>
          {bodyType === "dynamic" ? (
            <>
              <label className="flex items-center justify-between gap-2 py-1">
                <span className="text-[12px] text-fog">Affected by gravity</span>
                <input
                  type="checkbox"
                  checked={props?.gravityEnabled !== false}
                  onChange={(event) => set({ gravityEnabled: event.target.checked })}
                  aria-label="Affected by gravity"
                  className="h-4 w-4 accent-[#8f7bff]"
                />
              </label>
              <TextField
                label="Mass (0.01–10000)"
                value={typeof props?.mass === "number" ? String(props.mass) : "1"}
                numeric={{ min: 0.01, max: 10000, decimals: true }}
                onCommit={(value) => set({ mass: typeof value === "number" ? value : 1 })}
              />
            </>
          ) : null}
        </>
      ) : (
        <p className="px-1 text-[10.5px] leading-4 text-mist">
          Pick a body type to give this entity a collider — dynamic bodies fall
          with the scene gravity and collide with statics.
        </p>
      )}
    </Section>
  );
}

/** TASK 53: entity types participating in the 3D hierarchy — TASK 55 adds
 * the light, which parents exactly like any other 3D entity. */
const T3D_TYPES = new Set(["cube3d", "sphere3d", "plane3d", "camera3d", "light3d"]);

/** TASK 54/55: entities that can carry a physics body — meshes only. The
 * light and the camera are explicitly NON-physics: no collider, no body. */
const T3D_PHYSICS_TYPES = new Set(["cube3d", "sphere3d", "plane3d"]);

/**
 * TASK 57: the 3D character-controller panel — canonical props on the
 * player entity, layered over the TASK 54 physics body. The controller
 * reuses the physics `gravityEnabled` (never duplicated here) and the
 * screen's canonical Input Actions for bindings. Max slope angle is not
 * implemented by the axis-aligned physics solver and is NOT exposed.
 */
function Controller3DPanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { actions } = useBuilder();
  const set = (patch: PropsMap) => actions.updateProps(nodeId, patch);
  const enabled = props?.controllerEnabled === true;
  return (
    <Section title="Controller (3D player)">
      <label className="flex items-center justify-between gap-2 py-1">
        <span className="text-[12px] text-fog">Enabled (this entity is the player)</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => set({ controllerEnabled: event.target.checked })}
          aria-label="Controller enabled"
          className="h-4 w-4 accent-[#8f7bff]"
        />
      </label>
      {enabled ? (
        <>
          <TextField
            label="Move speed (0.1–100)"
            value={typeof props?.moveSpeed === "number" ? String(props.moveSpeed) : "5"}
            numeric={{ min: 0.1, max: 100, decimals: true }}
            onCommit={(value) => set({ moveSpeed: typeof value === "number" ? value : 5 })}
          />
          <TextField
            label="Acceleration (0–200)"
            value={typeof props?.acceleration === "number" ? String(props.acceleration) : "40"}
            numeric={{ min: 0, max: 200, decimals: true }}
            onCommit={(value) => set({ acceleration: typeof value === "number" ? value : 40 })}
          />
          <TextField
            label="Deceleration (0–200)"
            value={typeof props?.deceleration === "number" ? String(props.deceleration) : "60"}
            numeric={{ min: 0, max: 200, decimals: true }}
            onCommit={(value) => set({ deceleration: typeof value === "number" ? value : 60 })}
          />
          <TextField
            label="Jump force (0–50)"
            value={typeof props?.jumpForce === "number" ? String(props.jumpForce) : "6"}
            numeric={{ min: 0, max: 50, decimals: true }}
            onCommit={(value) => set({ jumpForce: typeof value === "number" ? value : 6 })}
          />
          <TextField
            label="Air control (0–1)"
            value={typeof props?.airControl === "number" ? String(props.airControl) : "0.4"}
            numeric={{ min: 0, max: 1, decimals: true }}
            onCommit={(value) => set({ airControl: typeof value === "number" ? value : 0.4 })}
          />
          <p className="px-1 text-[10.5px] leading-4 text-mist">
            Movement is relative to the active camera's facing. Gravity comes
            from the Physics section (Affected by gravity); jumping needs the
            body grounded. Keys bind in the screen's Input Actions panel —
            defaults: W/A/S/D, arrows, Space jumps. Max slope angle is not
            supported by the axis-aligned physics solver.
          </p>
        </>
      ) : (
        <p className="px-1 text-[10.5px] leading-4 text-mist">
          Enable to make this entity the player-controlled character: WASD /
          arrows move relative to the camera, Space jumps (physics-driven).
          Give the entity a Dynamic body and a collider in the Physics section.
        </p>
      )}
    </Section>
  );
}

/**
 * TASK 55: the 3D material panel — the canonical material is the base color
 * (the entity's `color` prop). Roughness/metalness are NOT implemented by
 * the flat-fill software rasterizer, so they get NO controls: the renderer
 * never pretends to support properties it cannot render.
 */
function Material3DPanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { actions } = useBuilder();
  return (
    <Section title="Material">
      <ColorField
        label="Base color"
        value={typeof props?.color === "string" ? props.color : "#58c7f0"}
        onChange={(value) => actions.updateProps(nodeId, { color: value })}
      />
      <p className="px-1 pt-1 text-[10.5px] leading-4 text-mist">
        The base color is the surface material. Roughness and metalness are
        not implemented by the flat-fill 3D rasterizer, so they have no
        controls here — unsupported properties are never faked.
      </p>
    </Section>
  );
}

/** TASK 55: how the 3D light behaves — honest semantics for the two types. */
function Light3DExplainer() {
  return (
    <p className="rounded-lg border border-line bg-card px-3 py-2 text-[11.5px] leading-5 text-mist">
      <strong className="text-fog">Point</strong> lights emit from their
      position in every direction and fade out over their{" "}
      <strong className="text-fog">Radius</strong>.{" "}
      <strong className="text-fog">Directional</strong> lights shine along
      their rotation with no falloff. Lights join the hierarchy (a parented
      light moves with its parent) and never take part in physics. Scene-wide
      brightness is the screen's Ambient light.
    </p>
  );
}

/**
 * The 3D hierarchy inspector: parent picker (self + descendants excluded —
 * cycles are impossible through the UI), duplicate subtree, delete with
 * child reparenting, and the DERIVED world transform as read-only values
 * (local transforms stay the only authored data).
 */
function Hierarchy3DPanel({
  nodeId,
  screen,
  node,
}: {
  nodeId: string;
  screen: ProjectModelScreen;
  node: ProjectModelComponent;
}) {
  const { actions } = useBuilder();
  const entities = screen.components.filter((c) => T3D_TYPES.has(c.type));
  const descendants = descendantsOf3D(entities, nodeId);
  const parentValue = typeof node.props?.parentId === "string" ? node.props.parentId : "";
  const world = computeWorldMatrices(entities).matrices.get(nodeId);
  const worldPos = world ? mat4TransformPoint(world.matrix, [0, 0, 0]) : null;

  return (
    <Section title="Hierarchy">
      <label className="flex flex-col gap-1 py-0.5">
        <span className="text-[12px] text-fog">Parent</span>
        <select
          value={parentValue}
          aria-label="Parent entity"
          onChange={(event) => {
            const parentId = event.target.value === "" ? null : event.target.value;
            actions.setParent3D(screen.id, nodeId, parentId);
          }}
          className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <option value="">None (root)</option>
          {entities
            .filter((e) => e.id !== nodeId && !descendants.has(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {String(e.props?.name ?? e.id)}
              </option>
            ))}
          {parentValue && !entities.some((e) => e.id === parentValue) ? (
            <option value={parentValue}>⚠ {parentValue} (deleted)</option>
          ) : null}
        </select>
      </label>
      {worldPos ? (
        <p className="rounded-lg border border-line bg-card px-2 py-1.5 font-mono text-[10.5px] leading-4 text-mist">
          world position<br />
          {worldPos.map((v) => v.toFixed(2)).join(", ")}
        </p>
      ) : null}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => actions.duplicateHierarchy3D(screen.id, nodeId)}
          className="h-7 flex-1 rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          Duplicate subtree
        </button>
        <button
          type="button"
          aria-label="Delete entity — children are reparented to its parent"
          title="Delete — children are reparented to this entity's parent"
          onClick={() => actions.removeComponent3D(screen.id, nodeId)}
          className="h-7 w-9 rounded-md border border-line text-[12px] text-mist transition-colors hover:border-rose hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          ✕
        </button>
      </div>
    </Section>
  );
}

/**
 * The sprite's state-machine editor: states (referencing existing animation
 * clips by id, with a playback-speed multiplier), parameters (bool/number/
 * trigger), and transitions (from — including Any State — to, explicit
 * priority order, optional exit time, deterministic conditions). Stored in
 * the canonical `animator` prop; the runtime feeds built-in parameters
 * (speed, isGrounded) from actual physics and drives the SLICE 2 player.
 * Every edit is one undoable commit.
 */
function StateMachinePanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { actions } = useBuilder();
  const machine = parseAnimator(props?.animator);
  const clips = parseAnimations(props?.animations);

  const commit = (next: AnimatorMachine) =>
    actions.updateProps(nodeId, { animator: animatorToString(next) });

  const enable = () => {
    const clips2 = parseAnimations(props?.animations);
    const firstClip = clips2[0]?.id ?? "";
    const stateId = genId("st");
    commit({
      states: [{ id: stateId, name: "Idle", clip: firstClip, speed: 1 }],
      params: [
        { name: "speed", type: "number", initial: "0" },
        { name: "isGrounded", type: "bool", initial: "1" },
      ],
      transitions: [],
      defaultId: stateId,
    });
  };

  if (!machine) {
    return (
      <Section title="Animation state machine">
        <p className="px-1 pb-2 text-[11px] leading-4 text-mist">
          A state machine switches between your animation clips automatically
          — states reference the clips above, transitions react to parameters
          (speed and isGrounded come from the player's real physics).
        </p>
        <button
          type="button"
          onClick={enable}
          disabled={clips.length === 0}
          className="h-7 w-full rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
        >
          {clips.length === 0 ? "Create a clip first" : "+ Enable state machine"}
        </button>
      </Section>
    );
  }

  const update = (patch: Partial<AnimatorMachine>) => commit({ ...machine, ...patch });

  const addState = () => {
    let name = "State";
    for (let n = 2; machine.states.some((s) => s.name === name); n += 1) name = `State ${n}`;
    const state = { id: genId("st"), name, clip: clips[0]?.id ?? "", speed: 1 };
    update({ states: [...machine.states, state] });
  };

  const removeState = (index: number) => {
    const removed = machine.states[index];
    if (!removed) return;
    const states = machine.states.filter((_, i) => i !== index);
    const transitions = machine.transitions.filter((t) => t.from !== removed.id && t.to !== removed.id);
    const defaultId = machine.defaultId === removed.id ? states[0]?.id ?? "" : machine.defaultId;
    commit({ ...machine, states, transitions, defaultId });
  };

  const addTransition = () => {
    const from = machine.defaultId || machine.states[0]?.id || "";
    const to = machine.states.find((s) => s.id !== from)?.id ?? from;
    commit({
      ...machine,
      transitions: [...machine.transitions, { from, to, order: machine.transitions.length, exitTime: 0, conds: [] }],
    });
  };

  const paramTypeLabel: Record<AnimatorParamType, string> = { bool: "Bool", number: "Number", trigger: "Trigger" };

  return (
    <Section title="Animation state machine">
      {/* States */}
      <p className="px-1 text-[10px] font-mono uppercase tracking-[0.14em] text-mist">States</p>
      <ul className="mb-2 flex flex-col gap-1">
        {machine.states.map((state, index) => (
          <li key={state.id} className="flex flex-col gap-1 rounded-lg border border-line bg-card px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`default-state-${nodeId}`}
                checked={machine.defaultId === state.id}
                onChange={() => update({ defaultId: state.id })}
                aria-label={`Make ${state.name} the default state`}
                title="The default state plays when the game runs"
                className="h-3.5 w-3.5 shrink-0 accent-[#8f7bff]"
              />
              <input
                defaultValue={state.name}
                aria-label={`Name for state ${state.name}`}
                onBlur={(event) => {
                  const v = event.target.value.trim();
                  if (v && v !== state.name) {
                    const states = machine.states.map((s, i) => (i === index ? { ...s, name: v } : s));
                    update({ states });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  event.stopPropagation();
                }}
                className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              />
              <select
                value={state.clip}
                aria-label={`Animation clip for state ${state.name}`}
                onChange={(event) => {
                  const states = machine.states.map((s, i) => (i === index ? { ...s, clip: event.target.value } : s));
                  update({ states });
                }}
                className="h-7 w-24 shrink-0 rounded-md border border-line bg-panel px-1 text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {clips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clip.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Delete state ${state.name}`}
                onClick={() => removeState(index)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-1.5 pl-5">
              <span className="shrink-0 font-mono text-[10px] text-mist">speed</span>
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                defaultValue={state.speed}
                aria-label={`Playback speed for state ${state.name}`}
                onBlur={(event) => {
                  const speed = Number(event.target.value);
                  if (Number.isFinite(speed) && speed > 0 && speed !== state.speed) {
                    const states = machine.states.map((s, i) => (i === index ? { ...s, speed: Math.min(10, speed) } : s));
                    update({ states });
                  }
                }}
                className="h-7 w-16 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              />
              <span className="font-mono text-[10px] text-mist">
                clip: {clips.find((c) => c.id === state.clip)?.name ?? "⚠ missing"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addState}
        className="h-7 w-full rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        + Add state
      </button>

      {/* Parameters */}
      <p className="mt-3 px-1 text-[10px] font-mono uppercase tracking-[0.14em] text-mist">Parameters</p>
      <ul className="mb-2 flex flex-col gap-1">
        {machine.params.map((param, index) => (
          <li key={param.name} className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">{param.name}</span>
            <span className="shrink-0 rounded border border-line px-1 py-0.5 font-mono text-[9.5px] text-mist">
              {paramTypeLabel[param.type]}
            </span>
            {param.type !== "trigger" ? (
              <input
                defaultValue={param.initial}
                aria-label={`Initial value for parameter ${param.name}`}
                onBlur={(event) => {
                  const params = machine.params.map((p, i) => (i === index ? { ...p, initial: event.target.value.trim() } : p));
                  update({ params });
                }}
                className="h-7 w-14 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              />
            ) : null}
            <button
              type="button"
              aria-label={`Delete parameter ${param.name}`}
              onClick={() => update({ params: machine.params.filter((_, i) => i !== index) })}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <AddParameterRow onAdd={(param) => update({ params: [...machine.params, param] })} existing={machine.params.map((p) => p.name)} />

      {/* Transitions */}
      <p className="mt-3 px-1 text-[10px] font-mono uppercase tracking-[0.14em] text-mist">Transitions</p>
      <ul className="mb-2 flex flex-col gap-1">
        {machine.transitions.map((transition, index) => {
          const stateOptions = (value: string, label: string) => (
            <>
              <option value="*">{label}</option>
              {machine.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {value && value !== "*" && !machine.states.some((s) => s.id === value) ? (
                <option value={value}>⚠ {value} (deleted)</option>
              ) : null}
            </>
          );
          return (
            <li key={`${transition.from}-${transition.to}-${index}`} className="flex flex-col gap-1 rounded-lg border border-line bg-card px-2 py-1.5">
              <div className="flex items-center gap-1">
                <select
                  value={transition.from}
                  aria-label={`Transition ${index + 1} source state`}
                  onChange={(event) => {
                    const transitions = machine.transitions.map((t, i) => (i === index ? { ...t, from: event.target.value } : t));
                    update({ transitions });
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-1 text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  {stateOptions(transition.from, "Any state")}
                </select>
                <span className="shrink-0 text-[11px] text-mist">→</span>
                <select
                  value={transition.to}
                  aria-label={`Transition ${index + 1} target state`}
                  onChange={(event) => {
                    const transitions = machine.transitions.map((t, i) => (i === index ? { ...t, to: event.target.value } : t));
                    update({ transitions });
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-1 text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  {machine.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Delete transition ${index + 1}`}
                  onClick={() => update({ transitions: machine.transitions.filter((_, i) => i !== index) })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 font-mono text-[10px] text-mist">when</span>
                <input
                  defaultValue={animatorConditionsToString(transition.conds)}
                  aria-label={`Conditions for transition ${index + 1}`}
                  placeholder="e.g. speed>0 && attack==1"
                  onBlur={(event) => {
                    const conds = parseAnimatorConditions(event.target.value);
                    const transitions = machine.transitions.map((t, i) => (i === index ? { ...t, conds } : t));
                    update({ transitions });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    event.stopPropagation();
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 font-mono text-[10px] text-mist">priority</span>
                <input
                  type="number"
                  defaultValue={transition.order}
                  aria-label={`Priority for transition ${index + 1}`}
                  onBlur={(event) => {
                    const order = Math.round(Number(event.target.value));
                    if (Number.isFinite(order) && order !== transition.order) {
                      const transitions = machine.transitions.map((t, i) => (i === index ? { ...t, order } : t));
                      update({ transitions });
                    }
                  }}
                  className="h-7 w-14 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                <span className="shrink-0 font-mono text-[10px] text-mist">exit at</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  defaultValue={transition.exitTime}
                  aria-label={`Exit time for transition ${index + 1}`}
                  onBlur={(event) => {
                    const exitTime = Number(event.target.value);
                    if (Number.isFinite(exitTime) && exitTime >= 0 && exitTime <= 1 && exitTime !== transition.exitTime) {
                      const transitions = machine.transitions.map((t, i) => (i === index ? { ...t, exitTime } : t));
                      update({ transitions });
                    }
                  }}
                  className="h-7 w-14 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                <span className="font-mono text-[10px] text-mist">(0 = now, 1 = clip end)</span>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={addTransition}
        className="h-7 w-full rounded-md border border-line text-[11.5px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        + Add transition
      </button>
    </Section>
  );
}

/** One-row add form for a machine parameter (name + type). */
function AddParameterRow({
  onAdd,
  existing,
}: {
  onAdd: (param: AnimatorParam) => void;
  existing: string[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AnimatorParamType>("number");
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || existing.includes(trimmed)) return;
    onAdd({ name: trimmed, type, initial: type === "bool" ? "0" : "0" });
    setName("");
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          event.stopPropagation();
        }}
        aria-label="New parameter name"
        placeholder="new parameter…"
        className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[11px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      />
      <select
        value={type}
        onChange={(event) => setType(event.target.value as AnimatorParamType)}
        aria-label="New parameter type"
        className="h-7 w-20 shrink-0 rounded-md border border-line bg-panel px-1 text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <option value="number">Number</option>
        <option value="bool">Bool</option>
        <option value="trigger">Trigger</option>
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={name.trim() === ""}
        className="h-7 shrink-0 rounded-md border border-line px-2 text-[11px] font-medium text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
      >
        + Param
      </button>
    </div>
  );
}

// ---- component inspector ----------------------------------------------------------

function ComponentInspector({ nodeId }: { nodeId: string }) {
  const { model, actions } = useBuilder();
  const location = locateComponent(model, nodeId);
  if (!location) return null;

  const node = location.node;
  const def = getDef(node.type);

  if (!def) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[12px] text-mist">Unknown component type “{node.type}”.</p>
        <DangerActions nodeId={nodeId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <header className="flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet/15 text-violet">
          <def.glyph size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{def.label}</p>
          <p className="truncate font-mono text-[10px] text-mist">{node.id}</p>
        </div>
      </header>

      {def.propFields.length > 0 ? (
        <Section title="Properties">
          {def.propFields.map((field) => (
            <InspectorField
              key={field.key}
              field={field}
              value={node.props?.[field.key]}
              screenId={location.screen.id}
              onCommit={(value) => actions.updateProps(node.id, { [field.key]: value })}
            />
          ))}
        </Section>
      ) : null}

      {def.type === "sprite" ? <SpriteTexturePanel nodeId={node.id} props={node.props} /> : null}
      {def.type === "sprite" ? <SpritePivotPanel nodeId={node.id} props={node.props} /> : null}
      {def.type === "tilemap" ? <TilePalettePanel nodeId={node.id} props={node.props} /> : null}
      {def.propFields.some((f) => f.key === "sortingLayer") ? (
        <Section title="Z order">
          {/* TASK 62 §27: sorting shortcuts through the SAME moveComponent op
              — no parallel z-index system. Higher layer/order draws in front. */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-sort-front="true"
              onClick={() => actions.reorderTo(node.id, "front")}
              className="h-7 rounded-md border border-line px-2 text-[11.5px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              Bring to front
            </button>
            <button
              type="button"
              data-sort-forward="true"
              onClick={() => actions.reorderTo(node.id, "forward")}
              className="h-7 rounded-md border border-line px-2 text-[11.5px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              Move forward
            </button>
            <button
              type="button"
              data-sort-backward="true"
              onClick={() => actions.reorderTo(node.id, "backward")}
              className="h-7 rounded-md border border-line px-2 text-[11.5px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              Move backward
            </button>
            <button
              type="button"
              data-sort-back="true"
              onClick={() => actions.reorderTo(node.id, "back")}
              className="h-7 rounded-md border border-line px-2 text-[11.5px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              Send to back
            </button>
          </div>
        </Section>
      ) : null}

      {def.type === "camera" ? (
        <p className="rounded-lg border border-line bg-card px-3 py-2 text-[11.5px] leading-5 text-mist">
          The runtime camera eases toward its target each frame.{" "}
          <strong className="text-fog">Smoothing</strong> 0 snaps instantly,
          0.05 is subtle, 0.15 is smooth, 0.3 is very smooth.{" "}
          <strong className="text-fog">Bounds</strong> clamp the viewport inside
          the world so empty space never shows. Shake is triggered from Blocks
          (“shake camera”) using the duration and strength here as defaults.
          Runtime position is never saved — only these settings are.
        </p>
      ) : null}

      {def.propFields.some((f) => f.key === "sortingLayer") ? (
        <p className="rounded-lg border border-line bg-card px-3 py-2 text-[11.5px] leading-5 text-mist">
          <strong className="text-fog">Rendering:</strong> objects on higher
          layers are drawn in front of lower ones;{" "}
          <strong className="text-fog">Order</strong> sorts within a layer
          (higher = in front). Manage the scene's layers with nothing selected.
        </p>
      ) : null}

      {def.type === "tilemap" ? (
        <p className="rounded-lg border border-line bg-card px-3 py-2 text-[11.5px] leading-5 text-mist">
          <strong className="text-fog">Rule tiles:</strong> with{" "}
          <strong className="text-fog">Auto-tile edges</strong> on, every tile
          on this tilemap reacts to its 4 painted neighbors (up, down, left,
          right). Interior cells (4 neighbors) shade darkest, edge cells (3)
          shade slightly darker, and corners or isolated cells keep the base
          palette color. Painting or erasing a cell restyles its neighbors
          automatically; the model stores the base tile values, so undo, redo
          and reload stay exact.
        </p>
      ) : null}

      {ANIMATION_ENTITY_TYPES.has(def.type) ? <AnimationPanel nodeId={node.id} props={node.props} /> : null}
      {ANIMATION_ENTITY_TYPES.has(def.type) ? <StateMachinePanel nodeId={node.id} props={node.props} /> : null}
      {T3D_TYPES.has(def.type) ? (
        <Hierarchy3DPanel nodeId={node.id} screen={location.screen} node={node} />
      ) : null}
      {T3D_PHYSICS_TYPES.has(def.type) ? <Physics3DPanel nodeId={node.id} props={node.props} /> : null}
      {T3D_PHYSICS_TYPES.has(def.type) ? <Controller3DPanel nodeId={node.id} props={node.props} /> : null}
      {T3D_PHYSICS_TYPES.has(def.type) ? <Material3DPanel nodeId={node.id} props={node.props} /> : null}
      {def.type === "light3d" ? <Light3DExplainer /> : null}

      <Section title="Style">
        {def.styleFields.map((field) => (
          <InspectorField
            key={field.key}
            field={field}
            value={node.styles?.[field.key]}
            screenId={location.screen.id}
            onCommit={(value) => actions.updateStyles(node.id, { [field.key]: value })}
          />
        ))}
      </Section>

      {eventsFor(def.type).length > 0 ? (
        <EventsSection nodeId={node.id} componentType={def.type} />
      ) : null}

      <DangerActions nodeId={nodeId} />
    </div>
  );
}

/** Event list for the selected component — bridges Design into Blocks. */
function EventsSection({ nodeId, componentType }: { nodeId: string; componentType: string }) {
  const { model, activeScreenId, setMode, selectHandler, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId);
  const handlers = screen?.logic?.handlers ?? [];

  const addHandlerFor = (event: string) => {
    const id = actions.addHandler(nodeId, event);
    selectHandler(id);
    setMode("blocks");
  };

  return (
    <Section title="Events">
      {eventsFor(componentType).map((event) => {
        const count = handlers.filter((h) => h.componentId === nodeId && h.event === event).length;
        return (
          <div key={event} className="flex items-center justify-between gap-2 py-1">
            <span className="text-[12px] text-fog">
              {EVENT_LABELS[event] ?? event}
              {count > 0 ? (
                <span className="ml-1.5 rounded border border-mint/30 bg-mint/10 px-1 py-px text-[10px] text-mint">
                  {count} handler{count === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => addHandlerFor(event)}
              className="h-7 rounded-md border border-line px-2 text-[11px] text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              + Blocks
            </button>
          </div>
        );
      })}
    </Section>
  );
}

function DangerActions({ nodeId }: { nodeId: string }) {
  const { actions } = useBuilder();
  return (
    <div className="flex gap-2 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => actions.duplicateComponent(nodeId)}
        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line text-[12px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconCopy size={13} />
        Duplicate
      </button>
      <button
        type="button"
        onClick={() => actions.removeComponent(nodeId)}
        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose/30 text-[12px] font-medium text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconTrash size={13} />
        Delete
      </button>
    </div>
  );
}

// ---- TASK 62 §8: sprite asset picker ------------------------------------------------
// A real picker for the Sprite texture: project image assets as thumbnails
// with name + measured pixel dimensions; click to assign, Replace re-opens
// the grid, Clear removes the texture. The canonical saved value stays the
// `asset:<id>` reference — nobody types asset ids by hand.

function SpriteTexturePanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { project, actions } = useBuilder();
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [open, setOpen] = useState(typeof props?.src !== "string" || props.src.trim() === "");
  const current = typeof props?.src === "string" ? props.src.trim() : "";
  const isAssetRef = current.startsWith("asset:");

  useEffect(() => {
    let cancelled = false;
    if (project?.id) {
      assetApi
        .list(project.id)
        .then(({ assets: list }) => {
          if (!cancelled) setAssets(list.filter((a) => a.mime.startsWith("image/")));
        })
        .catch(() => setAssets([]));
    }
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  const assign = (ref: string) => actions.updateProps(nodeId, { src: ref });
  const clear = () => actions.updateProps(nodeId, { src: undefined });

  return (
    <Section title="Sprite texture">
      <div className="flex items-center gap-2">
        {current ? (
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- project asset or user URL */}
            <img src={imageUrl(current)} alt="" className="h-full w-full object-contain" data-current-texture="true" />
          </span>
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-line text-[10px] text-mist">
            none
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-fog" data-texture-name="true">
            {isAssetRef
              ? assets.find((a) => current === `asset:${a.id}`)?.name ?? current
              : current || "No texture — the color shape renders."}
          </p>
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              data-texture-replace="true"
              onClick={() => setOpen((value) => !value)}
              aria-pressed={open}
              className="h-7 rounded-md border border-line px-2 text-[11.5px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              {current ? "Replace" : "Choose"}
            </button>
            {current ? (
              <button
                type="button"
                data-texture-clear="true"
                onClick={clear}
                className="h-7 rounded-md border border-rose/40 px-2 text-[11.5px] font-medium text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {open ? (
        assets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[11.5px] leading-4 text-mist">
            No image assets yet — draw one in the Asset Studio or upload a PNG,
            then come back.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5" data-asset-picker="true">
            {assets.map((asset) => {
              const ref = `asset:${asset.id}`;
              const active = current === ref;
              return (
                <button
                  key={asset.id}
                  type="button"
                  data-pick-asset={asset.id}
                  aria-pressed={active}
                  title={`${asset.name} — click to ${active ? "keep" : "assign"}`}
                  onClick={() => {
                    assign(ref);
                    setOpen(false);
                  }}
                  className={`group flex flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
                    active ? "border-violet bg-violet/10" : "border-line hover:border-violet/50"
                  }`}
                >
                  <span className="flex h-12 items-center justify-center overflow-hidden rounded-md bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- project asset thumbnail */}
                    <img
                      src={imageUrl(ref)}
                      alt={asset.name}
                      className="max-h-12 max-w-full object-contain"
                      onLoad={(event) => {
                        // Real dimensions, measured from the decoded image.
                        const img = event.currentTarget;
                        const label = img.parentElement?.parentElement?.querySelector("[data-asset-dims]");
                        if (label) label.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
                      }}
                    />
                  </span>
                  <span className="truncate text-[10.5px] font-medium text-fog">{asset.name}</span>
                  <span className="font-mono text-[9.5px] text-mist" data-asset-dims="true">
                    {asset.kind}
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : null}
    </Section>
  );
}

// ---- TASK 62 §10/§11: pivot presets + flips ------------------------------------------

function SpritePivotPanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { actions } = useBuilder();
  const pivotX = typeof props?.pivotX === "number" && Number.isFinite(props.pivotX) ? props.pivotX : 0.5;
  const pivotY = typeof props?.pivotY === "number" && Number.isFinite(props.pivotY) ? props.pivotY : 0.5;
  const flipX = props?.flipX === true;
  const flipY = props?.flipY === true;
  const setPivot = (x: number, y: number) => actions.updateProps(nodeId, { pivotX: x, pivotY: y });
  const presets: { key: string; label: string; x: number; y: number }[] = [
    { key: "center", label: "Center", x: 0.5, y: 0.5 },
    { key: "top", label: "Top", x: 0.5, y: 0 },
    { key: "bottom", label: "Bottom", x: 0.5, y: 1 },
    { key: "left", label: "Left", x: 0, y: 0.5 },
    { key: "right", label: "Right", x: 1, y: 0.5 },
  ];
  return (
    <Section title="Pivot & flip">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Pivot preset">
        {presets.map((preset) => {
          const active = Math.abs(pivotX - preset.x) < 0.001 && Math.abs(pivotY - preset.y) < 0.001;
          return (
            <button
              key={preset.key}
              type="button"
              data-pivot-preset={preset.key}
              aria-pressed={active}
              title={`Pivot: ${preset.label}`}
              onClick={() => setPivot(preset.x, preset.y)}
              className={`h-7 rounded-md border px-2 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
                active ? "border-violet bg-violet/10 text-violet" : "border-line text-fog hover:bg-surface hover:text-ink"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          data-flip-x="true"
          aria-pressed={flipX}
          title="Flip the sprite horizontally"
          onClick={() => actions.updateProps(nodeId, { flipX: !flipX })}
          className={`h-7 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
            flipX ? "border-violet bg-violet/10 text-violet" : "border-line text-fog hover:bg-surface hover:text-ink"
          }`}
        >
          ⇋ Flip X
        </button>
        <button
          type="button"
          data-flip-y="true"
          aria-pressed={flipY}
          title="Flip the sprite vertically"
          onClick={() => actions.updateProps(nodeId, { flipY: !flipY })}
          className={`h-7 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
            flipY ? "border-violet bg-violet/10 text-violet" : "border-line text-fog hover:bg-surface hover:text-ink"
          }`}
        >
          ⇵ Flip Y
        </button>
      </div>
      <p className="text-[10.5px] leading-4 text-mist">
        The pivot is the anchor for rotation and the fixed edge for flips. The
        asset itself is never modified — design canvas, preview, published and
        export all render the same way.
      </p>
    </Section>
  );
}

// ---- TASK 62 §16: visual tile palette editor -----------------------------------------
// Swatches, add/remove/reorder, a real color picker and per-tile SOLID
// collision flags (§20) — all persisted through the canonical `palette`
// string ("value:#hex:solid|pass;…") via updateProps. No shadow state.

interface PaletteEntry {
  value: number;
  color: string;
  solid: boolean;
}

function parsePaletteEntries(palette: string): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  for (const part of palette.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const [value, hex, flag] = seg.split(":");
    const num = parseInt(value ?? "", 10);
    if (!Number.isFinite(num) || !hex) continue;
    out.push({ value: num, color: hex.trim(), solid: (flag ?? "").trim().toLowerCase() !== "pass" });
  }
  return out.sort((a, b) => a.value - b.value);
}

function serializePaletteEntries(entries: PaletteEntry[]): string {
  return [...entries]
    .sort((a, b) => a.value - b.value)
    .map((e) => `${e.value}:${e.color}${e.solid ? "" : ":pass"}`)
    .join(";");
}

function TilePalettePanel({ nodeId, props }: { nodeId: string; props?: PropsMap }) {
  const { actions } = useBuilder();
  const entries = parsePaletteEntries(String(props?.palette ?? ""));
  const commit = (next: PaletteEntry[]) => actions.updateProps(nodeId, { palette: serializePaletteEntries(next) });

  const addTile = () => {
    const used = new Set(entries.map((e) => e.value));
    let value = 1;
    while (used.has(value)) value += 1;
    commit([...entries, { value, color: "#8f7bff", solid: true }]);
  };
  const removeTile = (value: number) => commit(entries.filter((e) => e.value !== value));
  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry!);
    commit(next);
  };
  const update = (value: number, patch: Partial<PaletteEntry>) =>
    commit(entries.map((e) => (e.value === value ? { ...e, ...patch } : e)));

  return (
    <Section title="Tile palette">
      <ul className="flex flex-col gap-1.5" data-tile-palette="true">
        {entries.map((entry, index) => (
          <li key={entry.value} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-1.5 py-1" data-tile-value={entry.value}>
            <span className="w-6 text-center font-mono text-[11px] text-fog">{entry.value}</span>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(entry.color) ? entry.color : "#2a3348"}
              aria-label={`Tile ${entry.value} color`}
              title={`Tile ${entry.value} color`}
              onChange={(event) => update(entry.value, { color: event.target.value })}
              className="h-7 w-9 cursor-pointer rounded border border-line bg-panel"
            />
            <button
              type="button"
              data-tile-solid-toggle={entry.value}
              aria-pressed={entry.solid}
              title={entry.solid ? "Solid — painted cells block the player" : "Non-solid — painted cells are decoration"}
              onClick={() => update(entry.value, { solid: !entry.solid })}
              className={`h-7 rounded-md border px-1.5 text-[10.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
                entry.solid ? "border-mint/40 bg-mint/10 text-mint" : "border-amber/40 bg-amber/10 text-amber"
              }`}
            >
              {entry.solid ? "solid" : "pass"}
            </button>
            <div className="ml-auto flex items-center">
              <button
                type="button"
                aria-label={`Reorder tile ${entry.value} earlier`}
                title="Reorder earlier"
                disabled={index === 0}
                onClick={() => reorder(index, -1)}
                className="flex h-6 w-6 items-center justify-center rounded text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint disabled:opacity-30"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label={`Reorder tile ${entry.value} later`}
                title="Reorder later"
                disabled={index === entries.length - 1}
                onClick={() => reorder(index, 1)}
                className="flex h-6 w-6 items-center justify-center rounded text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint disabled:opacity-30"
              >
                ▶
              </button>
              <button
                type="button"
                aria-label={`Remove tile ${entry.value}`}
                title="Remove tile"
                onClick={() => removeTile(entry.value)}
                className="flex h-6 w-6 items-center justify-center rounded text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-tile-add="true"
        onClick={addTile}
        className="h-7 w-full rounded-md border border-line px-2 text-[11.5px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
      >
        + Add tile
      </button>
      <p className="text-[10.5px] leading-4 text-mist">
        Solid tiles block the player; non-solid tiles render as decoration.
        The palette lives in the canonical tilemap props — painting, preview,
        published and export all read it.
      </p>
    </Section>
  );
}

// ---- fields -------------------------------------------------------------------------

function InspectorField({
  field,
  value,
  screenId,
  onCommit,
}: {
  field: FieldDef;
  value: unknown;
  /** The edited component's screen — entity pickers read its entities. */
  screenId?: string;
  onCommit: (value: string | number | boolean | undefined) => void;
}) {
  // Entity pickers read the current model; the hook runs unconditionally so
  // the field switch stays hook-free.
  const { model } = useBuilder();
  switch (field.type) {
    case "sorting-layer": {
      // TASK 15: the screen's named layers, back-to-front. Empty = World.
      const screen = screenId ? model.screens.find((s) => s.id === screenId) : undefined;
      const layers = screen ? sortingLayersOf(screen) : [];
      return (
        <label className="flex flex-col gap-1 py-0.5">
          <span className="text-[12px] text-fog">{field.label}</span>
          <select
            value={typeof value === "string" && value !== "" ? value : DEFAULT_SORTING_LAYER}
            onChange={(event) => onCommit(event.target.value === DEFAULT_SORTING_LAYER ? undefined : event.target.value)}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {layers.map((layer) => (
              <option key={layer.name} value={layer.name}>
                {layer.name} · {layer.order}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case "entity": {
      const screen = screenId ? model.screens.find((s) => s.id === screenId) : undefined;
      const entities = (screen?.components ?? []).filter((c) => c.type !== "camera");
      return (
        <label className="flex flex-col gap-1 py-0.5">
          <span className="text-[12px] text-fog">{field.label}</span>
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onCommit(event.target.value === "" ? undefined : event.target.value)}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            <option value="">None (static camera)</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.props?.name && typeof entity.props.name === "string" && entity.props.name.trim() !== ""
                  ? entity.props.name
                  : getDef(entity.type)?.label ?? entity.type}
                {" · "}
                {getDef(entity.type)?.label ?? entity.type}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case "boolean":
      return (
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-[12px] text-fog">{field.label}</span>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onCommit(event.target.checked)}
            className="h-4 w-4 accent-[#8f7bff]"
          />
        </label>
      );
    case "select":
      return (
        <label className="flex flex-col gap-1 py-0.5">
          <span className="text-[12px] text-fog">{field.label}</span>
          <select
            value={typeof value === "string" || typeof value === "number" ? String(value) : (field.options?.[0]?.value ?? "")}
            onChange={(event) => {
              const option = field.options?.find((o) => o.value === event.target.value);
              onCommit(option ? option.value : undefined);
            }}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "color":
      return (
        <ColorField
          label={field.label}
          value={typeof value === "string" ? value : ""}
          hint={field.defaultHint}
          onChange={onCommit}
        />
      );
    case "number":
      return (
        <TextField
          label={field.label}
          value={typeof value === "number" ? String(value) : ""}
          placeholder={field.placeholder}
          numeric={{ min: field.min, max: field.max, decimals: field.decimals }}
          onCommit={onCommit}
        />
      );
    case "textarea":
      return (
        <label className="flex flex-col gap-1 py-0.5">
          <span className="text-[12px] text-fog">{field.label}</span>
          <textarea
            defaultValue={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            rows={2}
            onBlur={(event) => onCommit(event.target.value)}
            className="w-full resize-y rounded-md border border-line bg-panel px-2 py-1.5 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
        </label>
      );
    default:
      return (
        <TextField
          label={field.label}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onCommit={onCommit}
        />
      );
  }
}

/** Text/number input with commit-on-blur/Enter so history stays readable. */
function TextField({
  label,
  value,
  placeholder,
  numeric,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  numeric?: { min?: number; max?: number; decimals?: boolean };
  onCommit: (value: string | number | boolean | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft === value) return;
    if (numeric) {
      const trimmed = draft.trim();
      if (trimmed === "") {
        onCommit(undefined);
        return;
      }
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) {
        setDraft(value);
        return;
      }
      const clamped = Math.min(numeric.max ?? Infinity, Math.max(numeric.min ?? -Infinity, parsed));
      // Camera-style fields (smoothing, seconds) keep decimals; px fields
      // stay integers so the model stays readable.
      onCommit(numeric.decimals ? clamped : Math.round(clamped));
      return;
    }
    onCommit(draft);
  };

  return (
    <label className="flex flex-col gap-1 py-0.5">
      <span className="text-[12px] text-fog">{label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          event.stopPropagation();
        }}
        placeholder={placeholder}
        inputMode={numeric ? "numeric" : undefined}
        className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === value) return;
    if (trimmed === "") {
      onChange(undefined);
      return;
    }
    // Accept #rgb/#rrggbb and bare hex; anything else is rejected quietly.
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
    if (!hex || hex[1] === undefined) {
      setDraft(value);
      return;
    }
    const body = hex[1].toLowerCase();
    if (body.length === 3) {
      onChange(`#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`);
    } else {
      onChange(`#${body}`);
    }
  };

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <span className="text-[12px] text-fog">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#ffffff"}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line bg-panel p-0.5"
        />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            event.stopPropagation();
          }}
          placeholder={hint ?? "#hex"}
          aria-label={label}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        />
      </div>
    </div>
  );
}

// ---- chrome ---------------------------------------------------------------------------

/**
 * TASK 63 §10: collapsible inspector sections — every section starts OPEN
 * (preserving today's behavior), and each header toggles with full
 * aria-expanded/aria-controls so beginners can fold what they don't need
 * without any field being hidden irrecoverably.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useMemo(() => `inspector-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, [title]);
  return (
    <section aria-label={title}>
      <button
        type="button"
        data-inspector-section={title}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        title={`${open ? "Collapse" : "Expand"} ${title}`}
        className="flex w-full items-center justify-between rounded-md px-1 pb-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <span className="font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
          {title}
        </span>
        <span aria-hidden="true" className={`text-mist transition-transform ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
      </button>
      <div id={id} className="flex flex-col" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function StaticRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[12px] text-fog">{label}</span>
      <span className={`min-w-0 truncate text-[12px] text-ink ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
