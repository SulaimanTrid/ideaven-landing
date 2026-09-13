import { genId } from "@/lib/project-model/ops";

/**
 * The Asset Studio's sprite document (TASK 09): frames of pixel layers.
 *
 * A layer's pixels serialize as a PNG data URL — compact, lossless, and
 * decodable through the Image element. The document lives in the browser's
 * localStorage (per project + doc id) while it is being authored; finished
 * frames are saved as real PNG assets through the project's existing asset
 * API, which is what makes them usable everywhere else in the platform.
 */

export interface SpriteLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** PNG data URL of this layer's RGBA pixels (transparent background). */
  dataUrl: string;
}

export interface SpriteFrame {
  id: string;
  /** Bottom-to-top paint order (index 0 renders first). */
  layers: SpriteLayer[];
}

export interface SpriteDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Preview playback rate for animation frames. */
  fps: number;
  frames: SpriteFrame[];
}

export const SPRITE_SIZES = [16, 32, 48, 64, 128] as const;

export const STORAGE_PREFIX = "ideaven-sprite-doc:";

export function storageKey(projectId: string, docId: string): string {
  return `${STORAGE_PREFIX}${projectId}:${docId}`;
}

export function loadDoc(projectId: string, docId: string): SpriteDoc | null {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, docId));
    return raw ? (JSON.parse(raw) as SpriteDoc) : null;
  } catch {
    return null;
  }
}

export function saveDoc(projectId: string, doc: SpriteDoc): boolean {
  try {
    window.localStorage.setItem(storageKey(projectId, doc.id), JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

/** A blank, transparent layer canvas serialized to a PNG data URL. */
export function blankLayerDataUrl(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.toDataURL("image/png");
}

export function createDoc(name: string, width: number, height: number): SpriteDoc {
  const layer = (name: string): SpriteLayer => ({
    id: genId("layer"),
    name,
    visible: true,
    locked: false,
    dataUrl: blankLayerDataUrl(width, height),
  });
  return {
    id: genId("sprite"),
    name,
    width,
    height,
    fps: 8,
    frames: [{ id: genId("frame"), layers: [layer("Background"), layer("Body"), layer("Details")] }],
  };
}

export function cloneDoc(doc: SpriteDoc): SpriteDoc {
  return JSON.parse(JSON.stringify(doc)) as SpriteDoc;
}

// ---- pixel helpers (all canvas-based, nearest-neighbour for crisp pixels) ----

/** Decodes a layer's data URL into an offscreen canvas for pixel work. */
export async function layerCanvas(dataUrl: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (dataUrl && dataUrl.length > 6) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("layer decode failed"));
      image.src = dataUrl;
    });
    ctx.drawImage(image, 0, 0);
  }
  return canvas;
}

/** Composites a frame's visible layers into one canvas (for display/export). */
export async function compositeFrame(
  frame: SpriteFrame,
  width: number,
  height: number,
  onlyLayerId?: string,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (const layer of frame.layers) {
    if (onlyLayerId ? layer.id !== onlyLayerId : !layer.visible) continue;
    try {
      const decoded = await layerCanvas(layer.dataUrl, width, height);
      ctx.drawImage(decoded, 0, 0);
    } catch {
      // A layer that fails to decode renders as absent — never as noise.
    }
  }
  return canvas;
}

/** Runs an edit against one layer's pixels and returns the new data URL. */
export async function editLayer(
  layer: SpriteLayer,
  width: number,
  height: number,
  edit: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
): Promise<string> {
  const canvas = await layerCanvas(layer.dataUrl, width, height);
  const ctx = canvas.getContext("2d")!;
  edit(ctx, canvas);
  return canvas.toDataURL("image/png");
}

/** Flips the whole layer (or a sub-rectangle) horizontally/vertically. */
export async function flipLayer(
  layer: SpriteLayer,
  width: number,
  height: number,
  horizontal: boolean,
  rect?: { x: number; y: number; w: number; h: number },
): Promise<string> {
  return editLayer(layer, width, height, (ctx, canvas) => {
    const region = rect ?? { x: 0, y: 0, w: width, h: height };
    const temp = document.createElement("canvas");
    temp.width = region.w;
    temp.height = region.h;
    const tctx = temp.getContext("2d")!;
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    ctx.clearRect(region.x, region.y, region.w, region.h);
    ctx.save();
    ctx.translate(region.x, region.y);
    ctx.imageSmoothingEnabled = false;
    if (horizontal) {
      ctx.translate(region.w, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, region.h);
      ctx.scale(1, -1);
    }
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
  });
}

/** Rotates the whole layer in 90° steps (pixel-safe; no resampling). */
export async function rotateLayer90(
  layer: SpriteLayer,
  width: number,
  height: number,
  quarterTurns: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const swap = turns % 2 === 1;
  const outW = swap ? height : width;
  const outH = swap ? width : height;
  const canvas = await layerCanvas(layer.dataUrl, width, height);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(canvas, -width / 2, -height / 2);
  return { dataUrl: out.toDataURL("image/png"), width: outW, height: outH };
}

/** Nearest-neighbour scale of the whole layer by a rational factor. */
export async function scaleLayer(
  layer: SpriteLayer,
  width: number,
  height: number,
  factorX: number,
  factorY: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const outW = Math.max(1, Math.round(width * factorX));
  const outH = Math.max(1, Math.round(height * factorY));
  const canvas = await layerCanvas(layer.dataUrl, width, height);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, outW, outH);
  return { dataUrl: out.toDataURL("image/png"), width: outW, height: outH };
}

/** Flood fill (exact-match) starting at the given pixel on one layer. */
export async function floodFill(
  layer: SpriteLayer,
  width: number,
  height: number,
  x: number,
  y: number,
  color: string,
): Promise<string> {
  return editLayer(layer, width, height, (ctx) => {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const idx = (px: number, py: number) => (py * width + px) * 4;
    const start = idx(x, y);
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
    const fill = hexToRgba(color);
    if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2] && target[3] === fill[3]) return;
    const stack: [number, number][] = [[x, y]];
    const seen = new Uint8Array(width * height);
    while (stack.length > 0) {
      const [px, py] = stack.pop()!;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const cell = py * width + px;
      if (seen[cell]) continue;
      seen[cell] = 1;
      const i = cell * 4;
      if (
        data[i] !== target[0] || data[i + 1] !== target[1] ||
        data[i + 2] !== target[2] || data[i + 3] !== target[3]
      ) continue;
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    ctx.putImageData(image, 0, 0);
  });
}

/** Reads the RGBA color at a pixel (eyedropper). */
export async function pickColor(
  layer: SpriteLayer,
  width: number,
  height: number,
  x: number,
  y: number,
): Promise<string | null> {
  const canvas = await layerCanvas(layer.dataUrl, width, height);
  const data = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
  if (data[3] === 0) return null;
  return `#${[data[0]!, data[1]!, data[2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Rasterizes a line into pixel coordinates (Bresenham). */
export function linePixels(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pixels: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pixels.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pixels;
}

export function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  return [
    parseInt(value.slice(0, 2), 16) || 0,
    parseInt(value.slice(2, 4), 16) || 0,
    parseInt(value.slice(4, 6), 16) || 0,
    255,
  ];
}

/** Builds a horizontal sprite-sheet data URL from the doc's frames. */
export async function spriteSheetDataUrl(doc: SpriteDoc): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = doc.width * doc.frames.length;
  canvas.height = doc.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  let x = 0;
  for (const frame of doc.frames) {
    const composited = await compositeFrame(frame, doc.width, doc.height);
    ctx.drawImage(composited, x, 0);
    x += doc.width;
  }
  return canvas.toDataURL("image/png");
}
