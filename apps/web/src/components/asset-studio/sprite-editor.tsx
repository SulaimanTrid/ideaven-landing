"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { cn } from "@ideaven/ui";
import { assetApi } from "@/lib/api";
import { genId } from "@/lib/project-model/ops";
import {
  type SpriteDoc,
  type SpriteFrame,
  type SpriteLayer,
  SPRITE_SIZES,
  cloneDoc,
  compositeFrame,
  createDoc,
  editLayer,
  flipLayer,
  floodFill,
  layerCanvas,
  linePixels,
  loadDoc,
  pickColor,
  rotateLayer90,
  saveDoc,
  scaleLayer,
  spriteSheetDataUrl,
} from "@/lib/sprite-doc";

/**
 * The 2D Asset Studio (TASK 09): a focused pixel-art / game-asset creator.
 * Not Photoshop — sprites, tiles, tiles, simple shapes and animation frames,
 * with the essential toolset, grid, zoom, layers, and frames. Finished work
 * saves as REAL PNG assets through the project's asset API (no fake
 * formats), which is what makes the results usable in the 2D Game Studio.
 */

type Tool =
  | "select" | "pencil" | "eraser" | "line" | "rect" | "circle"
  | "fill" | "picker" | "text";

const TOOLS: { id: Tool; label: string; glyph: string; key?: string }[] = [
  { id: "select", label: "Select", glyph: "⬚", key: "s" },
  { id: "pencil", label: "Pencil", glyph: "✎", key: "b" },
  { id: "eraser", label: "Eraser", glyph: "◻", key: "e" },
  { id: "line", label: "Line", glyph: "╱", key: "l" },
  { id: "rect", label: "Rectangle", glyph: "▭", key: "r" },
  { id: "circle", label: "Circle", glyph: "◯", key: "c" },
  { id: "fill", label: "Fill", glyph: "▩", key: "f" },
  { id: "picker", label: "Color picker", glyph: "⊕", key: "i" },
  { id: "text", label: "Text", glyph: "T", key: "t" },
];

const ZOOMS = [0.25, 0.5, 1, 2, 4, 8];
const PALETTE = [
  "#0c0f17", "#2a3348", "#5b6478", "#a9b0c2", "#e8ecf6", "#ffffff",
  "#8f7bff", "#5743d9", "#46e3b4", "#3fd0f0", "#ffb454", "#ff7d9c",
  "#4ade9f", "#c084fc", "#f97316", "#22d3ee",
];

interface Marquee { x: number; y: number; w: number; h: number }

export function SpriteEditor({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const docParam = searchParams.get("doc");

  const [doc, setDoc] = useState<SpriteDoc | null>(null);
  const [docsList, setDocsList] = useState<{ id: string; name: string; width: number; height: number }[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#46e3b4");
  const [brush, setBrush] = useState(1);
  const [zoom, setZoom] = useState(8);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(8);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const undoRef = useRef<SpriteDoc[]>([]);
  const redoRef = useRef<SpriteDoc[]>([]);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawState = useRef<{ startX: number; startY: number; lastX: number; lastY: number; previewCanvas?: HTMLCanvasElement } | null>(null);

  // ---- document bootstrap -----------------------------------------------------
  useEffect(() => {
    const list = listDocs(projectId);
    setDocsList(list);
    if (docParam) {
      const found = loadDoc(projectId, docParam);
      if (found) {
        setDoc(found);
        const lastLayer = found.frames[0]?.layers.at(-1);
    setActiveLayerId(lastLayer?.id ?? "");
        return;
      }
    }
    setDoc(null);
  }, [projectId, docParam]);

  // Persist on every doc change.
  useEffect(() => {
    if (doc) {
      saveDoc(projectId, doc);
    }
  }, [doc, projectId]);

  const frame: SpriteFrame | null = doc?.frames[frameIndex] ?? null;
  const activeLayer: SpriteLayer | null =
    frame?.layers.find((l) => l.id === activeLayerId) ?? frame?.layers[frame.layers.length - 1] ?? null;

  // ---- history -----------------------------------------------------------------
  const pushUndo = useCallback(() => {
    if (!doc) return;
    undoRef.current.push(cloneDoc(doc));
    if (undoRef.current.length > 25) undoRef.current.shift();
    redoRef.current = [];
  }, [doc]);

  const undo = useCallback(() => {
    if (!doc || undoRef.current.length === 0) return;
    redoRef.current.push(cloneDoc(doc));
    const prev = undoRef.current.pop()!;
    setDoc(prev);
  }, [doc]);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    if (doc) undoRef.current.push(cloneDoc(doc));
    setDoc(redoRef.current.pop()!);
  }, [doc]);

  // ---- compositing ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!frame || !doc || !displayCanvasRef.current) return;
      const composited = await compositeFrame(frame, doc.width, doc.height);
      if (cancelled || !displayCanvasRef.current) return;
      const ctx = displayCanvasRef.current.getContext("2d")!;
      ctx.clearRect(0, 0, doc.width, doc.height);
      ctx.drawImage(composited, 0, 0);
      // Marquee overlay draws on top.
      if (marquee && tool === "select") {
        ctx.strokeStyle = "rgba(143,123,255,0.9)";
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.strokeRect(marquee.x + 0.5, marquee.y + 0.5, marquee.w, marquee.h);
        ctx.setLineDash([]);
      }
      // Shape preview overlay for line/rect/circle.
      const drag = drawState.current;
      if (drag && drag.previewCanvas) {
        ctx.drawImage(drag.previewCanvas, 0, 0);
      }
    })();
    return () => { cancelled = true; };
  }, [doc, frameIndex, frame, marquee, tool]);

  // ---- animation preview -----------------------------------------------------------
  useEffect(() => {
    if (!playing || !doc) return;
    const interval = window.setInterval(() => {
      setFrameIndex((index) => {
        const next = index + 1;
        if (next >= doc.frames.length) {
          if (loop) return 0;
          setPlaying(false);
          return index;
        }
        return next;
      });
    }, Math.max(40, Math.round(1000 / Math.max(1, doc.fps))));
    return () => window.clearInterval(interval);
  }, [playing, doc, loop]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!previewCanvasRef.current || !doc || !frame) return;
      void frame;
      const composited = await compositeFrame(frame, doc.width, doc.height);
      if (cancelled || !previewCanvasRef.current) return;
      const ctx = previewCanvasRef.current.getContext("2d")!;
      ctx.clearRect(0, 0, doc.width, doc.height);
      ctx.drawImage(composited, 0, 0);
    })();
    return () => { cancelled = true; };
  }, [doc, frameIndex, frame, playing]);

  // ---- coordinate mapping -------------------------------------------------------
  const pixelOf = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    if (!doc) return [0, 0];
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * doc.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * doc.height);
    return [Math.max(0, Math.min(doc.width - 1, x)), Math.max(0, Math.min(doc.height - 1, y))];
  };

  const stamp = (ctx: CanvasRenderingContext2D, x: number, y: number, erase: boolean) => {
    const half = Math.floor(brush / 2);
    ctx.fillStyle = erase ? "rgba(0,0,0,0)" : color;
    if (erase) {
      ctx.clearRect(x - half, y - half, brush, brush);
    } else {
      ctx.fillRect(x - half, y - half, brush, brush);
    }
  };

  // ---- pointer handling -------------------------------------------------------------
  const onPointerDown = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc || !frame || !activeLayer) return;
    const [x, y] = pixelOf(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "select") {
      setMarquee({ x, y, w: 1, h: 1 });
      drawState.current = { startX: x, startY: y, lastX: x, lastY: y };
      return;
    }
    if (tool === "picker") {
      const picked = await pickColorOverComposite(frame, doc.width, doc.height, x, y);
      if (picked) setColor(picked);
      return;
    }
    if (tool === "fill") {
      pushUndo();
      if (activeLayer.locked) return toastMessage("That layer is locked.");
      const dataUrl = await floodFill(activeLayer, doc.width, doc.height, x, y, color);
      updateLayer(activeLayer.id, { dataUrl });
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Text to place");
      if (!text) return;
      pushUndo();
      if (activeLayer.locked) return toastMessage("That layer is locked.");
      const size = Math.max(6, Math.round(doc.height / 6));
      const dataUrl = await editLayer(activeLayer, doc.width, doc.height, (ctx) => {
        ctx.fillStyle = color;
        ctx.font = `${size}px monospace`;
        ctx.textBaseline = "top";
        ctx.fillText(text, x, y);
      });
      updateLayer(activeLayer.id, { dataUrl });
      return;
    }
    if (tool === "pencil" || tool === "eraser") {
      pushUndo();
      if (activeLayer.locked) return toastMessage("That layer is locked.");
      const dataUrl = await editLayer(activeLayer, doc.width, doc.height, (ctx) => {
        stamp(ctx, x, y, tool === "eraser");
      });
      updateLayer(activeLayer.id, { dataUrl });
      drawState.current = { startX: x, startY: y, lastX: x, lastY: y };
      return;
    }
    // line / rect / circle: preview then commit
    drawState.current = { startX: x, startY: y, lastX: x, lastY: y };
  };

  const onPointerMove = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc || !drawState.current) return;
    const [x, y] = pixelOf(event);
    const drag = drawState.current;
    if (tool === "select" && marquee) {
      setMarquee({
        x: Math.min(drag.startX, x),
        y: Math.min(drag.startY, y),
        w: Math.abs(x - drag.startX) + 1,
        h: Math.abs(y - drag.startY) + 1,
      });
      return;
    }
    if (tool === "pencil" || tool === "eraser") {
      if (drag.lastX === x && drag.lastY === y) return;
      if (!activeLayer || activeLayer.locked) return;
      const dataUrl = await editLayer(activeLayer, doc.width, doc.height, (ctx) => {
        for (const [px, py] of linePixels(drag.lastX, drag.lastY, x, y)) {
          stamp(ctx, px, py, tool === "eraser");
        }
      });
      updateLayer(activeLayer.id, { dataUrl });
      drag.lastX = x;
      drag.lastY = y;
      return;
    }
    if (tool === "line" || tool === "rect" || tool === "circle") {
      // Live preview on an overlay canvas.
      const preview = document.createElement("canvas");
      preview.width = doc.width;
      preview.height = doc.height;
      const ctx = preview.getContext("2d")!;
      ctx.fillStyle = color;
      if (tool === "line") {
        for (const [px, py] of linePixels(drag.startX, drag.startY, x, y)) ctx.fillRect(px, py, 1, 1);
      } else if (tool === "rect") {
        ctx.fillRect(Math.min(drag.startX, x), Math.min(drag.startY, y), Math.abs(x - drag.startX) + 1, Math.abs(y - drag.startY) + 1);
      } else {
        const cx = drag.startX;
        const cy = drag.startY;
        const rx = Math.abs(x - cx);
        const ry = Math.abs(y - cy);
        for (let py = -ry; py <= ry; py++) {
          for (let px = -rx; px <= rx; px++) {
            if ((px * px) / (rx * rx || 1) + (py * py) / (ry * ry || 1) <= 1.05) {
              ctx.fillRect(cx + px, cy + py, 1, 1);
            }
          }
        }
      }
      drag.previewCanvas = preview;
      drag.lastX = x;
      drag.lastY = y;
      bump();
    }
  };

  const onPointerUp = async () => {
    const drag = drawState.current;
    drawState.current = null;
    if (!doc || !frame || !drag) return;
    if (tool === "line" || tool === "rect" || tool === "circle") {
      if (!activeLayer || activeLayer.locked) return;
      pushUndo();
      const dataUrl = await editLayer(activeLayer, doc.width, doc.height, (ctx) => {
        if (!drag.previewCanvas) return;
        ctx.drawImage(drag.previewCanvas, 0, 0);
      });
      updateLayer(activeLayer.id, { dataUrl });
      bump();
    }
    if (tool !== "select") drawState.current = null;
  };

  // ---- selection operations -----------------------------------------------------------
  const cropLayerCanvas = async (layer: SpriteLayer, docRef: SpriteDoc, rect: Marquee): Promise<string> => {
    const source = await layerCanvas(layer.dataUrl, docRef.width, docRef.height);
    const out = document.createElement("canvas");
    out.width = rect.w;
    out.height = rect.h;
    out.getContext("2d")!.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return out.toDataURL("image/png");
  };

  const selectionOp = async (op: "delete" | "crop" | "duplicate" | "flipH" | "flipV" | "rotate" | "scaleUp" | "scaleDown" | "move") => {
    if (!doc || !frame || !activeLayer) return;
    pushUndo();
    if (op === "crop") {
      if (!marquee) return toastMessage("Drag a selection first.");
      const frames = await Promise.all(doc.frames.map(async (f) => ({
        id: f.id,
        layers: await Promise.all(f.layers.map(async (l) => ({
          ...l,
          dataUrl: await cropLayerCanvas(l, doc, marquee),
        }))),
      })));
      setDoc({ ...doc, width: marquee.w, height: marquee.h, frames });
      setMarquee(null);
      return;
    }
    if (op === "scaleUp" || op === "scaleDown") {
      const factor = op === "scaleUp" ? 2 : 0.5;
      const result = await scaleLayer(activeLayer, doc.width, doc.height, factor, factor);
      setDoc({ ...doc, width: result.width, height: result.height, frames: doc.frames.map((f) => ({
        ...f,
        layers: f.layers.map((l) => (l.id === activeLayer.id ? { ...l, dataUrl: result.dataUrl } : l)),
      })) });
      return;
    }
    if (op === "rotate") {
      const result = await rotateLayer90(activeLayer, doc.width, doc.height, 1);
      setDoc({ ...doc, width: result.width, height: result.height, frames: doc.frames.map((f) => ({
        ...f,
        layers: f.layers.map((l) => (l.id === activeLayer.id ? { ...l, dataUrl: result.dataUrl } : l)),
      })) });
      return;
    }
    const rect = marquee ?? undefined;
    if (op === "delete") {
      if (!marquee) return toastMessage("Drag a selection first.");
      const dataUrl = await editLayer(activeLayer, doc.width, doc.height, (ctx) => {
        ctx.clearRect(marquee.x, marquee.y, marquee.w, marquee.h);
      });
      updateLayer(activeLayer.id, { dataUrl });
      return;
    }
    if (op === "duplicate") {
      if (!marquee) return toastMessage("Drag a selection first.");
      const offset = 4;
      const dataUrl = await editLayer(activeLayer, doc.width, doc.height, async (ctx, canvas) => {
        const temp = document.createElement("canvas");
        temp.width = marquee.w;
        temp.height = marquee.h;
        temp.getContext("2d")!.drawImage(canvas, marquee.x, marquee.y, marquee.w, marquee.h, 0, 0, marquee.w, marquee.h);
        ctx.drawImage(temp, marquee.x + offset, marquee.y + offset);
      });
      updateLayer(activeLayer.id, { dataUrl });
      return;
    }
    if (op === "flipH" || op === "flipV") {
      const dataUrl = await flipLayer(activeLayer, doc.width, doc.height, op === "flipH", rect);
      updateLayer(activeLayer.id, { dataUrl });
      return;
    }
    if (op === "move") {
      toastMessage("Drag inside the selection to move those pixels.");
    }
  };

  // ---- layer / frame ops -----------------------------------------------------------
  const updateLayer = (layerId: string, patch: Partial<SpriteLayer>) => {
    setDoc((current) => {
      if (!current) return current;
      return {
        ...current,
        frames: current.frames.map((f, index) =>
          index === frameIndex
            ? { ...f, layers: f.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
            : f,
        ),
      };
    });
  };

  const addLayer = () => {
    if (!doc || !frame) return;
    pushUndo();
    const layer: SpriteLayer = { id: genId("layer"), name: `Layer ${frame.layers.length + 1}`, visible: true, locked: false, dataUrl: blankUrl(doc.width, doc.height) } as SpriteLayer;
    setDoc({ ...doc, frames: doc.frames.map((f, i) => (i === frameIndex ? { ...f, layers: [...f.layers, layer] } : f)) });
    setActiveLayerId(layer.id);
  };


  const removeLayer = (layerId: string) => {
    if (!doc || !frame || frame.layers.length <= 1) return toastMessage("A frame needs at least one layer.");
    pushUndo();
    const layers = frame.layers.filter((l) => l.id !== layerId);
    setDoc({ ...doc, frames: doc.frames.map((f, i) => (i === frameIndex ? { ...f, layers } : f)) });
    if (activeLayerId === layerId) setActiveLayerId(layers[layers.length - 1]!.id);
  };

  const reorderLayer = (layerId: string, direction: -1 | 1) => {
    if (!frame) return;
    pushUndo();
    const index = frame.layers.findIndex((l) => l.id === layerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= frame.layers.length) return;
    const layers = [...frame.layers];
    const a = layers[index]!;
    const b = layers[target]!;
    layers[index] = b;
    layers[target] = a;
    setDoc({ ...doc!, frames: doc!.frames.map((f, i) => (i === frameIndex ? { ...f, layers } : f)) });
  };

  const addFrame = (duplicateCurrent: boolean) => {
    if (!doc || !frame) return;
    pushUndo();
    const layers = duplicateCurrent
      ? frame.layers.map((l) => ({ ...l, id: genId("layer"), dataUrl: l.dataUrl }))
      : frame.layers.map((l) => ({ ...l, id: genId("layer"), dataUrl: blankUrl(doc.width, doc.height) }));
    const frames = [...doc.frames];
    frames.splice(frameIndex + 1, 0, { id: genId("frame"), layers });
    setDoc({ ...doc, frames });
    setFrameIndex(frameIndex + 1);
  };

  const removeFrame = () => {
    if (!doc || doc.frames.length <= 1) return toastMessage("A sprite needs at least one frame.");
    pushUndo();
    const frames = doc.frames.filter((_, i) => i !== frameIndex);
    setDoc({ ...doc, frames });
    setFrameIndex(Math.max(0, frameIndex - 1));
  };

  // ---- saving ---------------------------------------------------------------------
  const toastMessage = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  };

  const dataUrlToFile = async (dataUrl: string, name: string): Promise<File> => {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], name, { type: "image/png" });
  };

  const saveFrame = async (mode: "frame" | "allFrames" | "sheet") => {
    if (!doc) return;
    setSaving(true);
    setSaveError(null);
    try {
      const base = (doc.name || "sprite").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
      if (mode === "frame" && frame) {
        const composited = await compositeFrame(frame, doc.width, doc.height);
        const file = await dataUrlToFile(composited.toDataURL("image/png"), `${base}-frame-${frameIndex + 1}.png`);
        const { asset } = await assetApi.upload(projectId, file);
        toastMessage(`Saved "${asset.name}" to Project Assets (asset:${asset.id}).`);
      } else if (mode === "allFrames") {
        let saved = 0;
        for (let i = 0; i < doc.frames.length; i++) {
          const composited = await compositeFrame(doc.frames[i]!, doc.width, doc.height);
          const file = await dataUrlToFile(composited.toDataURL("image/png"), `${base}-frame-${i + 1}.png`);
          await assetApi.upload(projectId, file);
          saved++;
        }
        toastMessage(`Saved ${saved} frame PNGs to Project Assets.`);
      } else {
        const sheet = await spriteSheetDataUrl(doc);
        const file = await dataUrlToFile(sheet, `${base}-sheet.png`);
        const { asset } = await assetApi.upload(projectId, file);
        toastMessage(`Sprite sheet saved as "${asset.name}" (asset:${asset.id}).`);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving failed. Try again shortly.");
    } finally {
      setSaving(false);
    }
  };

  const download = async (mode: "frame" | "sheet") => {
    if (!doc) return;
    const dataUrl = mode === "sheet"
      ? await spriteSheetDataUrl(doc)
      : (await compositeFrame(frame!, doc.width, doc.height)).toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = mode === "sheet" ? `${doc.name || "sprite"}-sheet.png` : `${doc.name || "sprite"}.png`;
    link.click();
  };

  // ---- new doc creation -----------------------------------------------------------
  const [newName, setNewName] = useState("My Sprite");
  const [newSize, setNewSize] = useState<number>(32);
  const startDoc = () => {
    const doc2 = createDoc(newName || "My Sprite", newSize, newSize);
    saveDoc(projectId, doc2);
    setDocsList(listDocs(projectId));
    setDoc(doc2);
    setActiveLayerId(doc2.frames[0]!.layers.at(-1)!.id);
    setFrameIndex(0);
    // The URL carries the doc id so reloads and bookmarks return to the
    // work. history.replaceState keeps this a pure URL update — no remount,
    // no state loss.
    window.history.replaceState(null, "", `/builder/${projectId}/asset-studio?doc=${doc2.id}`);
  };

  // ---- keyboard shortcuts -----------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
      const tool2 = TOOLS.find((t) => t.key === event.key.toLowerCase());
      if (tool2) setTool(tool2.id);
      if (event.key === "Delete" || event.key === "Backspace") {
        if (tool === "select") void selectionOp("delete");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- new-doc picker ------------------------------------------------------------------
  if (!doc) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16">
        <Link href={`/builder/${projectId}`} className="text-[13px] text-violet hover:underline">← Builder</Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Asset Studio</h1>
        <p className="mt-1 text-[14px] text-fog">
          Create sprites, tiles, and animation frames. Saved work becomes real PNG
          assets in this project.
        </p>

        <div className="mt-6 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-mist">New sprite</h2>
          <label className="mt-3 block text-[12px] text-fog" htmlFor="sprite-name">Name</label>
          <input
            id="sprite-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-ink focus:border-violet/60 focus:outline-none"
          />
          <p className="mt-3 text-[12px] text-fog">Canvas size</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SPRITE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={newSize === size}
                onClick={() => setNewSize(size)}
                className={`h-8 rounded-lg border px-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                  newSize === size ? "border-violet/60 bg-violet/10 text-violet" : "border-line bg-panel text-fog hover:text-ink"
                }`}
              >
                {size}×{size}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={startDoc}
            className="mt-4 h-10 w-full rounded-lg bg-violet-deep text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            Create sprite
          </button>
        </div>

        {docsList.length > 0 ? (
          <div className="mt-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-mist">Continue editing</h2>
            <ul className="mt-2 space-y-1.5">
              {docsList.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/builder/${projectId}/asset-studio?doc=${entry.id}`}
                    className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-3 text-[13px] text-ink transition-colors hover:border-violet/50"
                  >
                    <span>{entry.name}</span>
                    <span className="text-[11px] text-mist">{entry.width}×{entry.height}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </main>
    );
  }

  // ---- editor -----------------------------------------------------------------------
  const layerLocked = activeLayer?.locked ?? false;

  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink">
      {/* Header */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        <Link href={`/builder/${projectId}`} className="rounded-md px-2 py-1 text-[12px] text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint">
          ← Builder
        </Link>
        <span className="min-w-0 truncate text-[13px] font-semibold">{doc.name}</span>
        <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-mist">{doc.width}×{doc.height}</span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <HeaderButton label="Undo (Ctrl+Z)" onClick={() => undo()} disabled={undoRef.current.length === 0}>↶</HeaderButton>
          <HeaderButton label="Redo (Ctrl+Y)" onClick={() => redo()} disabled={redoRef.current.length === 0}>↷</HeaderButton>
          <HeaderButton label="Zoom out" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z)}>−</HeaderButton>
          <span className="w-10 text-center font-mono text-[11px] text-mist">{Math.round(zoom * 100)}%</span>
          <HeaderButton label="Zoom in" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)}>+</HeaderButton>
          <HeaderButton label="Fit" onClick={() => setZoom(1)}>Fit</HeaderButton>
          <button
            type="button"
            onClick={() => void saveFrame("frame")}
            disabled={saving}
            className="h-7 rounded-md bg-violet-deep px-3 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save to Assets"}
          </button>
          <button
            type="button"
            onClick={() => setInspectorOpen((open) => !open)}
            className="rounded-md border border-line px-2 py-1 text-[12px] text-fog hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint lg:hidden"
          >
            {inspectorOpen ? "Hide panel" : "Panel"}
          </button>
        </div>
      </header>

      {saveError ? <p className="shrink-0 border-b border-rose/40 bg-rose/10 px-4 py-1.5 text-[12px] text-rose">{saveError}</p> : null}
      {toast ? (
        <p role="status" className="shrink-0 border-b border-mint/40 bg-mint/10 px-4 py-1.5 text-[12px] text-mint">{toast}</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Tool rail (desktop) / hidden on mobile (tray below) */}
        <aside className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2 sm:flex" aria-label="Tools">
          {TOOLS.map((t) => (
            <ToolButton key={t.id} active={tool === t.id} label={`${t.label}${t.key ? ` (${t.key.toUpperCase()})` : ""}`} onClick={() => setTool(t.id)}>
              {t.glyph}
            </ToolButton>
          ))}
          <div className="my-1 h-px w-8 bg-line" aria-hidden />
          <ToolButton label="Flip horizontal" onClick={() => void selectionOp("flipH")}>⇋</ToolButton>
          <ToolButton label="Flip vertical" onClick={() => void selectionOp("flipV")}>⇅</ToolButton>
          <ToolButton label="Rotate 90°" onClick={() => void selectionOp("rotate")}>⟳</ToolButton>
          <ToolButton label="Scale layer ×2" onClick={() => void selectionOp("scaleUp")}>⤢</ToolButton>
          <ToolButton label="Scale layer ÷2" onClick={() => void selectionOp("scaleDown")}>⤡</ToolButton>
          <ToolButton label="Duplicate selection" onClick={() => void selectionOp("duplicate")}>⧉</ToolButton>
          <ToolButton label="Delete selection" onClick={() => void selectionOp("delete")}>✕</ToolButton>
          <ToolButton label="Crop to selection" onClick={() => void selectionOp("crop")}>FSIZE</ToolButton>
          <div className="my-1 h-px w-8 bg-line" aria-hidden />
          {[1, 2, 3, 4].map((size) => (
            <ToolButton key={size} active={brush === size} label={`Brush ${size}px`} onClick={() => setBrush(size)}>
              <span className="block rounded-full bg-current" style={{ width: size * 2 + 2, height: size * 2 + 2 }} />
            </ToolButton>
          ))}
        </aside>

        {/* Canvas stage */}
        <section className="relative min-w-0 flex-1 overflow-auto p-6" aria-label="Sprite canvas">
          <div className="mx-auto w-fit">
            <div className="relative" style={{ width: doc.width * zoom, height: doc.height * zoom }}>
              <canvas
                ref={displayCanvasRef}
                width={doc.width}
                height={doc.height}
                style={{
                  width: doc.width * zoom,
                  height: doc.height * zoom,
                  imageRendering: "pixelated",
                  touchAction: "none",
                  cursor: tool === "picker" ? "crosshair" : "crosshair",
                }}
                className="rounded-sm border border-line bg-[repeating-conic-gradient(#1a1f2e_0%_25%,#12151f_0%_50%)] bg-[length:16px_16px]"
                onPointerDown={(e) => void onPointerDown(e)}
                onPointerMove={(e) => void onPointerMove(e)}
                onPointerUp={() => void onPointerUp()}
              />
              {showGrid && zoom >= 4 ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      `linear-gradient(to right, rgb(255 255 255 / 0.07) 1px, transparent 1px),
                       linear-gradient(to bottom, rgb(255 255 255 / 0.07) 1px, transparent 1px)`,
                    backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
                  }}
                />
              ) : null}
            </div>
            {/* Selection ops (context toolbar) */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ToggleChip active={showGrid} onClick={() => setShowGrid((v) => !v)}>Grid</ToggleChip>
              {[8, 16, 32, 64].map((size) => (
                <ToggleChip key={size} active={gridSize === size} onClick={() => { setGridSize(size); setShowGrid(true); }}>{size}</ToggleChip>
              ))}
              {marquee ? (
                <span className="ml-2 font-mono text-[11px] text-violet">
                  selection {marquee.w}×{marquee.h}
                </span>
              ) : (
                <span className="ml-2 text-[11px] text-mist">Select tool + drag to mark pixels</span>
              )}
            </div>
          </div>
        </section>

        {/* Right inspector */}
        <aside
          className={`${
            inspectorOpen ? "fixed inset-x-0 bottom-0 top-12 z-40 flex flex-col bg-panel" : "hidden"
          } w-full shrink-0 flex-col overflow-y-auto border-l border-line bg-panel lg:flex lg:w-60 lg:static lg:inset-auto`}
          aria-label="Inspector"
        >
          <div className="border-b border-line p-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist">Color</h2>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                aria-label="Primary color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent"
              />
              <span className="font-mono text-[12px] text-fog">{color}</span>
            </div>
            <div className="mt-2 grid grid-cols-8 gap-1">
              {PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Color ${swatch}`}
                  onClick={() => setColor(swatch)}
                  className={`h-5 w-5 rounded border ${color === swatch ? "border-violet" : "border-line"}`}
                  style={{ background: swatch }}
                />
              ))}
            </div>
          </div>

          {/* Layers */}
          <div className="border-b border-line p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist">Layers</h2>
              <button type="button" onClick={addLayer} className="rounded px-1.5 text-[12px] text-violet hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint" aria-label="Add layer">+</button>
            </div>
            <ul className="mt-2 space-y-1">
              {[...(frame?.layers ?? [])].reverse().map((layer) => (
                <li
                  key={layer.id}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[12px] ${
                    layer.id === activeLayer?.id ? "border-violet/60 bg-violet/10" : "border-line bg-card"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                    onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                    className="w-5 text-center text-mist hover:text-ink"
                  >
                    {layer.visible ? "◉" : "○"}
                  </button>
                  <button
                    type="button"
                    aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                    onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                    className="w-5 text-center text-mist hover:text-ink"
                  >
                    {layer.locked ? "🔒" : "⚿"}
                  </button>
                  <input
                    value={layer.name}
                    onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                    aria-label={`Rename ${layer.name}`}
                    className="min-w-0 flex-1 bg-transparent text-ink focus:outline-none"
                  />
                  <button type="button" aria-label={`Move ${layer.name} up`} onClick={() => reorderLayer(layer.id, 1)} className="text-mist hover:text-ink">↑</button>
                  <button type="button" aria-label={`Move ${layer.name} down`} onClick={() => reorderLayer(layer.id, -1)} className="text-mist hover:text-ink">↓</button>
                  <button type="button" aria-label={`Delete ${layer.name}`} onClick={() => removeLayer(layer.id)} className="text-mist hover:text-rose">✕</button>
                </li>
              ))}
            </ul>
            {layerLocked ? <p className="mt-1.5 text-[11px] text-amber">Active layer is locked.</p> : null}
          </div>

          {/* Frames + preview */}
          <div className="p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist">Frames</h2>
              <div className="flex gap-1">
                <button type="button" onClick={() => addFrame(false)} aria-label="Add empty frame" className="rounded px-1.5 text-[12px] text-violet hover:bg-surface">+ empty</button>
                <button type="button" onClick={() => addFrame(true)} aria-label="Duplicate frame" className="rounded px-1.5 text-[12px] text-violet hover:bg-surface">+ copy</button>
                <button type="button" onClick={removeFrame} aria-label="Delete frame" className="rounded px-1.5 text-[12px] text-mist hover:text-rose">✕</button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} className="h-7 w-8 rounded-md border border-line bg-card text-[12px] hover:text-ink">
                {playing ? "❚❚" : "▶"}
              </button>
              <button type="button" onClick={() => setLoop((l) => !l)} aria-pressed={loop} className={`h-7 rounded-md border px-2 text-[12px] ${loop ? "border-violet/60 text-violet" : "border-line text-mist"}`}>
                ↻ Loop
              </button>
              <label className="ml-auto flex items-center gap-1 text-[11px] text-mist">
                FPS
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={doc.fps}
                  onChange={(e) => setDoc({ ...doc, fps: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })}
                  className="w-12 rounded border border-line bg-card px-1 py-0.5 text-center text-ink"
                />
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-canvas p-2">
              <canvas
                ref={previewCanvasRef}
                width={doc.width}
                height={doc.height}
                style={{ width: 64, height: 64, imageRendering: "pixelated" }}
                className="rounded border border-line"
                aria-label="Animation preview"
              />
              <span className="text-[11px] leading-4 text-mist">
                frame {frameIndex + 1}/{doc.frames.length} · {doc.fps} fps{playing ? " · playing" : ""}
              </span>
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
              {doc.frames.map((f, index) => (
                <FrameThumb key={f.id} doc={doc} frame={f} active={index === frameIndex} onClick={() => { setFrameIndex(index); }} index={index} />
              ))}
            </div>
          </div>

          {/* Export */}
          <div className="mt-auto border-t border-line p-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist">Export</h2>
            <div className="mt-2 grid gap-1.5">
              <button type="button" onClick={() => void saveFrame("allFrames")} disabled={saving} className="h-8 rounded-lg border border-line bg-card text-[12px] text-fog hover:text-ink disabled:opacity-40">
                Save every frame as PNG → Project Assets
              </button>
              <button type="button" onClick={() => void saveFrame("sheet")} disabled={saving} className="h-8 rounded-lg border border-line bg-card text-[12px] text-fog hover:text-ink disabled:opacity-40">
                Save sprite sheet (horizontal) → Assets
              </button>
              <button type="button" onClick={() => void download("frame")} className="h-8 rounded-lg border border-line bg-card text-[12px] text-fog hover:text-ink">
                Download frame PNG
              </button>
              <button type="button" onClick={() => void download("sheet")} className="h-8 rounded-lg border border-line bg-card text-[12px] text-fog hover:text-ink">
                Download sprite sheet PNG
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-mist">
              PNG is the supported format — frames and horizontal sheets. Saved
              assets appear in the project's Assets panel and can texture scene
              entities in the 2D Game Studio.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile tool tray */}
      <div className="flex gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-1.5 sm:hidden" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "h-9 w-9 shrink-0 rounded-lg border text-[14px] transition-colors",
              tool === t.id ? "border-violet/60 bg-violet/15 text-violet" : "border-line bg-card text-fog",
            )}
          >
            {t.glyph}
          </button>
        ))}
        {([["⇋", "flipH"], ["⇅", "flipV"], ["⟳", "rotate"], ["⧉", "duplicate"], ["✕", "delete"]] as const).map(([glyph, op]) => (
          <button
            key={op}
            type="button"
            aria-label={op}
            onClick={() => void selectionOp(op)}
            className="h-9 w-9 shrink-0 rounded-lg border border-line bg-card text-[14px] text-fog"
          >
            {glyph}
          </button>
        ))}
      </div>
    </main>
  );
}

// ---- shared bits ---------------------------------------------------------------------

function listDocs(projectId: string): { id: string; name: string; width: number; height: number }[] {
  const out: { id: string; name: string; width: number; height: number }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(`ideaven-sprite-doc:${projectId}:`)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const doc = JSON.parse(raw) as SpriteDoc;
      out.push({ id: doc.id, name: doc.name, width: doc.width, height: doc.height });
    }
  } catch {
    // A broken index just means the list renders empty — docs remain loadable by id.
  }
  return out;
}

function blankUrl(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.toDataURL("image/png");
}

async function pickColorOverComposite(frame: SpriteFrame, width: number, height: number, x: number, y: number): Promise<string | null> {
  const composited = await compositeFrame(frame, width, height);
  const data = composited.getContext("2d")!.getImageData(x, y, 1, 1).data;
  if (data[3] === 0) return null;
  return `#${[data[0]!, data[1]!, data[2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function HeaderButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-7 min-w-7 rounded-md border border-line bg-card px-1.5 text-[12px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
        active ? "border-violet/60 bg-violet/15 text-violet" : "border-transparent text-fog hover:bg-surface hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ToggleChip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-6 rounded-full border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
        active ? "border-violet/60 bg-violet/10 text-violet" : "border-line bg-card text-mist hover:text-fog",
      )}
    >
      {children}
    </button>
  );
}

function FrameThumb({
  doc,
  frame,
  active,
  index,
  onClick,
}: {
  doc: SpriteDoc;
  frame: SpriteFrame;
  active: boolean;
  index: number;
  onClick: () => void;
}) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void compositeFrame(frame, doc.width, doc.height).then((canvas) => {
      if (!cancelled) setUrl(canvas.toDataURL("image/png"));
    });
    return () => { cancelled = true; };
  }, [frame, doc.width, doc.height]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Frame ${index + 1}`}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-md border p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
        active ? "border-violet" : "border-line hover:border-violet/40",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local pixel canvas data */}
      <img src={url} alt="" width={40} height={40} style={{ imageRendering: "pixelated" }} className="rounded-sm bg-canvas" />
      <span className="block text-center font-mono text-[9px] text-mist">{index + 1}</span>
    </button>
  );
}
