/**
 * TASK 66 §47: THE capability matrix — one machine-readable source for
 * truthful messaging everywhere (export dialog, docs, tests). There is no
 * second capability list: UI text that describes what a runtime target
 * supports reads this matrix.
 *
 * Targets are the real runtime surfaces:
 *  - editor      — the authoring canvases (Design/Blocks/Code)
 *  - preview     — the builder's Preview mode (same React runtime)
 *  - published   — /p/<slug> via LiveApp (same React runtime)
 *  - export-html — the standalone single-file export (vanilla runtime mirror)
 *  - export-android / export-windows — the same vanilla runtime wrapped for
 *                  the target toolchain (asset base intentionally empty)
 *
 * States: SUPPORTED / PARTIAL / UNSUPPORTED. A PARTIAL or UNSUPPORTED cell
 * MUST carry an honest note — the note text is what the UI shows.
 */

export type CapabilityId =
  | "app-ui"
  | "scene-2d"
  | "scene-3d"
  | "blocks"
  | "custom-code"
  | "extensions"
  | "assets"
  | "audio";

export type RuntimeTarget =
  | "editor"
  | "preview"
  | "published"
  | "export-html"
  | "export-android"
  | "export-windows";

export type CapabilityState = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";

export interface CapabilityCell {
  state: CapabilityState;
  note?: string;
}

const SAME_RUNTIME_NOTE =
  "Runs on the same canonical block IR and scene runtimes as the editor.";

export const CAPABILITY_MATRIX: Record<CapabilityId, Record<RuntimeTarget, CapabilityCell>> = {
  "app-ui": {
    editor: { state: "SUPPORTED" },
    preview: { state: "SUPPORTED", note: SAME_RUNTIME_NOTE },
    published: { state: "SUPPORTED", note: SAME_RUNTIME_NOTE },
    "export-html": { state: "SUPPORTED", note: "Vanilla mirror of the app renderer (layout, text, inputs, listview, canvas, switch, checkbox)." },
    "export-android": { state: "SUPPORTED", note: "Same standalone runtime inside the WebView shell." },
    "export-windows": { state: "SUPPORTED", note: "Same standalone runtime inside the Electron shell." },
  },
  "scene-2d": {
    editor: { state: "SUPPORTED" },
    preview: { state: "SUPPORTED", note: SAME_RUNTIME_NOTE },
    published: { state: "SUPPORTED", note: SAME_RUNTIME_NOTE },
    "export-html": { state: "SUPPORTED", note: "Vanilla mirror: gravity, AABB collision, tilemap solids, sorting, sprites, animation, state machine, particles, lighting, camera (follow/bounds/shake/pixel-snap)." },
    "export-android": { state: "SUPPORTED", note: "Same standalone runtime inside the WebView shell." },
    "export-windows": { state: "SUPPORTED", note: "Same standalone runtime inside the Electron shell." },
  },
  "scene-3d": {
    editor: { state: "SUPPORTED" },
    preview: { state: "SUPPORTED", note: SAME_RUNTIME_NOTE },
    published: { state: "SUPPORTED", note: SAME_RUNTIME_NOTE },
    "export-html": { state: "SUPPORTED", note: "Vanilla mirror of the software rasterizer: transforms, hierarchy, materials, lighting, physics, character controller, with runtime observability attributes." },
    "export-android": { state: "SUPPORTED", note: "Same standalone runtime inside the WebView shell." },
    "export-windows": { state: "SUPPORTED", note: "Same standalone runtime inside the Electron shell." },
  },
  blocks: {
    editor: { state: "SUPPORTED" },
    preview: { state: "SUPPORTED", note: "Every built-in block executes on the canonical IR (extension blocks are the exception — see extensions)." },
    published: { state: "SUPPORTED", note: "Same interpreter as preview." },
    "export-html": { state: "SUPPORTED", note: "Vanilla mirror of the same block vocabulary; unknown types are skipped with an honest report." },
    "export-android": { state: "SUPPORTED", note: "Same vanilla mirror." },
    "export-windows": { state: "SUPPORTED", note: "Same vanilla mirror." },
  },
  "custom-code": {
    editor: { state: "SUPPORTED", note: "Custom TypeScript is authored, parsed, and stored verbatim on the screen (never destroyed)." },
    preview: { state: "UNSUPPORTED", note: "The runtime executes the block IR; custom code is not executed yet — it is stored and round-trips through code sync." },
    published: { state: "UNSUPPORTED", note: "Only the block IR runs on a published page." },
    "export-html": { state: "UNSUPPORTED", note: "The standalone runtime executes the block IR; custom code is not bundled or executed." },
    "export-android": { state: "UNSUPPORTED", note: "Same as the HTML export." },
    "export-windows": { state: "UNSUPPORTED", note: "Same as the HTML export." },
  },
  extensions: {
    editor: { state: "SUPPORTED", note: "Installed + enabled extensions contribute real palette vocabulary; references save as ext:<slug>:<type>." },
    preview: { state: "UNSUPPORTED", note: "Extension providers do not run yet — ext: blocks are skipped and the skip is reported (toast + runtime trace)." },
    published: { state: "UNSUPPORTED", note: "Same honest skip as preview." },
    "export-html": { state: "UNSUPPORTED", note: "Exports never bundle extension source; ext: blocks report the skip once per type." },
    "export-android": { state: "UNSUPPORTED", note: "Same as the HTML export." },
    "export-windows": { state: "UNSUPPORTED", note: "Same as the HTML export." },
  },
  assets: {
    editor: { state: "SUPPORTED" },
    preview: { state: "SUPPORTED", note: "Stored assets resolve through the project asset API." },
    published: { state: "SUPPORTED", note: "Assets resolve while the project stays published; deleted assets render an honest broken state." },
    "export-html": { state: "PARTIAL", note: "asset: references point at the API origin the export was downloaded from — the project must stay published for stored images to load." },
    "export-android": { state: "PARTIAL", note: "A phone cannot reach this server, so stored asset images render as the honest placeholder; external URLs load normally." },
    "export-windows": { state: "PARTIAL", note: "Same as Android — stored asset images render as the honest placeholder." },
  },
  audio: {
    editor: { state: "SUPPORTED", note: "Sound assets and play/stop blocks." },
    preview: { state: "SUPPORTED", note: "Unresolvable sounds warn honestly, never fake playback." },
    published: { state: "SUPPORTED", note: "Same asset resolution as preview." },
    "export-html": { state: "SUPPORTED", note: "Play-sound resolves asset refs against the export's API origin; unresolvable names warn once." },
    "export-android": { state: "PARTIAL", note: "Stored audio needs the published API to be reachable; WebView autoplay policies may require interaction first." },
    "export-windows": { state: "SUPPORTED", note: "Electron plays audio with no autoplay restriction." },
  },
};

export const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  "app-ui": "App UI",
  "scene-2d": "2D scenes",
  "scene-3d": "3D scenes",
  blocks: "Blocks",
  "custom-code": "Custom TypeScript",
  extensions: "Extension providers",
  assets: "Stored assets",
  audio: "Audio",
};

/** Honest per-target notes shown in the export dialog when a target starts.
 *  Declared AFTER the labels (it runs at module init). */
export const EXPORT_TARGET_NOTES: Record<string, string[]> = {
  web: notesFor("export-html"),
  apk: notesFor("export-android"),
  aab: notesFor("export-android"),
  exe: notesFor("export-windows"),
  package: ["A re-importable backup: the canonical model + assets + metadata (not a runnable runtime)."],
};

function notesFor(target: RuntimeTarget): string[] {
  const notes: string[] = [];
  for (const [capability, cells] of Object.entries(CAPABILITY_MATRIX)) {
    const cell = cells[target];
    if (cell && cell.state !== "SUPPORTED" && cell.note) {
      notes.push(`${CAPABILITY_LABELS[capability as CapabilityId]} — ${cell.state}: ${cell.note}`);
    }
  }
  return notes;
}
