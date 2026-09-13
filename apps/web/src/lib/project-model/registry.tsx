import type { ComponentType, SVGProps } from "react";
import { CATEGORY_LABELS } from "./blocks";
import type { PropsMap } from "@/types/project";

/**
 * The Ideaven component registry. Every builder surface — palette, canvas
 * renderer, component tree, inspector — reads from these definitions, so a
 * component type exists exactly once and always renders for real. Types are
 * added here only when the canvas renderer and inspector schema for them are
 * complete; nothing in the palette is decorative.
 */

export type ComponentCategory =
  | "ui"
  | "layout"
  | "storage"
  | "connectivity"
  | "sensors"
  | "media"
  | "game";

/** Field descriptor for one editable property or style key. */
export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "color" | "select" | "boolean";
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
  /** Placeholder shown for empty color fields. */
  defaultHint?: string;
}

export interface ComponentDef {
  type: string;
  label: string;
  category: ComponentCategory;
  /** Containers accept children on the canvas. */
  container: boolean;
  /** True when the component can hold text content used by tree labels. */
  textKey?: "text" | "label";
  glyph: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  defaultProps: PropsMap;
  defaultStyles: PropsMap;
  propFields: FieldDef[];
  styleFields: FieldDef[];
  /** Events the component exposes to the block engine and runtime. */
  events?: string[];
  /**
   * Set when the component's architecture is defined but its runtime is not
   * implemented yet (honest capability state): the palette shows it disabled
   * with this reason instead of pretending it works.
   */
  designed?: string;
}

/** Screen-level events (handlers with no component reference). */
export const SCREEN_EVENTS = ["initialize"] as const;

/** Events per component type — the single source for the block engine. */
const EVENT_MAP: Record<string, string[]> = {
  button: ["click"],
  image: ["click"],
  "text-input": ["change", "enter"],
  "password-input": ["change", "enter"],
  checkbox: ["change"],
  switch: ["change"],
  listview: ["itemClick"],
  clock: ["timer"],
  "location-sensor": ["location"],
  "accelerometer-sensor": ["shake"],
  canvas: ["touch"],
};

/** Effective event list for a component type. */
export function eventsFor(type: string): string[] {
  return EVENT_MAP[type] ?? [];
}

/** Human labels for event names across the platform. */
export const EVENT_LABELS: Record<string, string> = {
  click: "Click",
  change: "Change",
  enter: "Enter pressed",
  initialize: "Initialize",
  itemClick: "Item clicked",
  timer: "Timer",
  location: "Location changed",
  shake: "Shake",
  touch: "Touch",
};

// ---- field shorthands -------------------------------------------------------

const f = {
  text: (key: string, label: string, placeholder?: string): FieldDef => ({
    key, label, type: "text", placeholder,
  }),
  textarea: (key: string, label: string, placeholder?: string): FieldDef => ({
    key, label, type: "textarea", placeholder,
  }),
  number: (key: string, label: string, min = 0, max = 999): FieldDef => ({
    key, label, type: "number", min, max, placeholder: "px",
  }),
  color: (key: string, label: string, hint: string): FieldDef => ({
    key, label, type: "color", defaultHint: hint,
  }),
  select: (key: string, label: string, options: [string, string][]): FieldDef => ({
    key, label, type: "select", options: options.map(([value, l]) => ({ value, label: l })),
  }),
  boolean: (key: string, label: string): FieldDef => ({
    key, label, type: "boolean",
  }),
};

// Shared style groups (compose per component; beginners see them in order).
const typography = [
  f.color("color", "Text color", "#0b0e16"),
  f.number("fontSize", "Font size", 8, 96),
  f.select("fontWeight", "Weight", [["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"]]),
  f.select("textAlign", "Align", [["left", "Left"], ["center", "Center"], ["right", "Right"]]),
];
const box = [
  f.color("background", "Background", "#ffffff"),
  f.number("padding", "Padding", 0, 96),
  f.number("radius", "Corner radius", 0, 48),
  f.number("borderWidth", "Border width", 0, 12),
  f.color("borderColor", "Border color", "#d5d9e2"),
];
const flex = [
  f.number("gap", "Gap between children", 0, 96),
  f.select("align", "Align children", [["stretch", "Stretch"], ["start", "Start"], ["center", "Center"], ["end", "End"]]),
  f.select("justify", "Distribute", [["start", "Start"], ["center", "Center"], ["end", "End"], ["between", "Space between"]]),
];

// ---- palette glyphs (24px, stroke-based, drawn for Ideaven) ------------------

function glyph(path: string) {
  const Glyph = (props: SVGProps<SVGSVGElement> & { size?: number }) => (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
  return Glyph;
}

// ---- registry ----------------------------------------------------------------

export const COMPONENT_DEFS: ComponentDef[] = [
  // Layout
  {
    type: "column", label: "Column", category: "layout", container: true,
    glyph: glyph("M12 3v18M7.5 7h9M7.5 12h9M7.5 17h9"),
    defaultProps: {},
    defaultStyles: { background: "#ffffff", padding: 16, radius: 12, gap: 12 },
    propFields: [],
    styleFields: [...box, ...flex],
  },
  {
    type: "row", label: "Row", category: "layout", container: true,
    glyph: glyph("M3 12h18M7 7.5v9M12 7.5v9M17 7.5v9"),
    defaultProps: {},
    defaultStyles: { background: "#ffffff", padding: 16, radius: 12, gap: 12 },
    propFields: [],
    styleFields: [...box, ...flex],
  },
  {
    type: "container", label: "Container", category: "layout", container: true,
    glyph: glyph("M4.5 4.5h15v15h-15z"),
    defaultProps: {},
    defaultStyles: { background: "#f4f5f8", padding: 16, radius: 12, gap: 12 },
    propFields: [],
    styleFields: [...box, ...flex],
  },
  {
    type: "card", label: "Card", category: "layout", container: true,
    glyph: glyph("M5 8.5 8.5 5h10a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V8.5ZM8.5 5v3.5H5"),
    defaultProps: {},
    defaultStyles: { background: "#ffffff", padding: 16, radius: 16, borderWidth: 1, borderColor: "#e3e6ee", gap: 8 },
    propFields: [],
    styleFields: [...box, ...flex],
  },
  {
    type: "spacer", label: "Spacer", category: "layout", container: false,
    glyph: glyph("M12 5v14M6.5 8.5h11M6.5 15.5h11"),
    defaultProps: {},
    defaultStyles: { height: 24 },
    propFields: [],
    styleFields: [f.number("height", "Height", 4, 400), f.boolean("grow", "Fill remaining space")],
  },
  {
    type: "divider", label: "Divider", category: "layout", container: false,
    glyph: glyph("M4 12h16"),
    defaultProps: {},
    defaultStyles: { color: "#e3e6ee", thickness: 1, margin: 8 },
    propFields: [],
    styleFields: [f.color("color", "Color", "#e3e6ee"), f.number("thickness", "Thickness", 1, 8), f.number("margin", "Margin", 0, 64)],
  },

  // User interface
  {
    type: "text", label: "Text", category: "ui", container: false, textKey: "text",
    glyph: glyph("M5 6.5V5h14v1.5M12 5v14M9.5 19h5"),
    defaultProps: { text: "New text" },
    defaultStyles: { color: "#0b0e16", fontSize: 15, fontWeight: "400", textAlign: "left" },
    propFields: [f.textarea("text", "Text", "What should it say?")],
    styleFields: typography,
  },
  {
    type: "button", label: "Button", category: "ui", container: false, textKey: "label",
    glyph: glyph("M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7ZM8.5 12h7"),
    defaultProps: { label: "Button" },
    defaultStyles: { background: "#5743d9", color: "#ffffff", fontSize: 15, fontWeight: "600", padding: 12, radius: 10, borderWidth: 0 },
    propFields: [f.text("label", "Label", "What does it do?")],
    styleFields: [f.color("background", "Background", "#5743d9"), ...typography.slice(0, 3), f.number("padding", "Padding", 0, 48), f.number("radius", "Corner radius", 0, 32), f.number("borderWidth", "Border width", 0, 8), f.color("borderColor", "Border color", "#5743d9")],
  },
  {
    type: "icon", label: "Icon", category: "ui", container: false,
    glyph: glyph("M12 4.5 14.2 9.4 19.5 10.1 15.7 13.8 16.7 19.1 12 16.5 7.3 19.1 8.3 13.8 4.5 10.1 9.8 9.4 12 4.5Z"),
    defaultProps: { name: "star" },
    defaultStyles: { color: "#0b0e16", fontSize: 24 },
    propFields: [f.select("name", "Icon", [
      ["home", "Home"], ["user", "User"], ["star", "Star"], ["heart", "Heart"],
      ["settings", "Settings"], ["search", "Search"], ["plus", "Plus"], ["close", "Close"],
      ["check", "Check"], ["arrow-right", "Arrow right"], ["play", "Play"], ["menu", "Menu"],
    ])],
    styleFields: [f.color("color", "Color", "#0b0e16"), f.number("fontSize", "Size", 12, 96)],
  },
  {
    type: "image", label: "Image", category: "ui", container: false,
    glyph: glyph("M4.5 5.5h15v13h-15zM4.5 14.5 9 10l4 4 2.5-2.5 4 4"),
    defaultProps: { src: "", alt: "" },
    defaultStyles: { width: 200, height: 140, radius: 12, fit: "cover" },
    propFields: [f.text("src", "Image URL", "https://…"), f.text("alt", "Alt text", "Describe the image")],
    styleFields: [f.number("width", "Width", 24, 800), f.number("height", "Height", 24, 800), f.number("radius", "Corner radius", 0, 48), f.select("fit", "Fit", [["cover", "Cover"], ["contain", "Contain"]])],
  },

  // Input
  {
    type: "text-input", label: "Text Input", category: "ui", container: false,
    glyph: glyph("M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7ZM7.5 9.5h6"),
    defaultProps: { placeholder: "Enter text", value: "" },
    defaultStyles: { background: "#ffffff", color: "#0b0e16", borderColor: "#c9cede", radius: 10, padding: 12 },
    propFields: [f.text("placeholder", "Placeholder", "Hint text"), f.text("value", "Initial value")],
    styleFields: [f.color("background", "Background", "#ffffff"), f.color("color", "Text color", "#0b0e16"), f.color("borderColor", "Border color", "#c9cede"), f.number("radius", "Corner radius", 0, 24), f.number("padding", "Padding", 4, 32)],
  },
  {
    type: "password-input", label: "Password Input", category: "ui", container: false,
    glyph: glyph("M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7ZM9 12h.01M12 12h.01M15 12h.01"),
    defaultProps: { placeholder: "Enter password", value: "" },
    defaultStyles: { background: "#ffffff", color: "#0b0e16", borderColor: "#c9cede", radius: 10, padding: 12 },
    propFields: [f.text("placeholder", "Placeholder", "Hint text")],
    styleFields: [f.color("background", "Background", "#ffffff"), f.color("color", "Text color", "#0b0e16"), f.color("borderColor", "Border color", "#c9cede"), f.number("radius", "Corner radius", 0, 24), f.number("padding", "Padding", 4, 32)],
  },
  {
    type: "checkbox", label: "Checkbox", category: "ui", container: false,
    glyph: glyph("M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5v-9ZM9 12l2.2 2.2L15.5 10"),
    defaultProps: { label: "Check me", checked: false },
    defaultStyles: { color: "#0b0e16", fontSize: 15 },
    propFields: [f.text("label", "Label", "Checkbox label"), f.boolean("checked", "Checked by default")],
    styleFields: [f.color("color", "Text color", "#0b0e16"), f.number("fontSize", "Font size", 8, 48)],
  },
  {
    type: "switch", label: "Switch", category: "ui", container: false,
    glyph: glyph("M8.5 7.5h7a4.5 4.5 0 0 1 0 9h-7a4.5 4.5 0 0 1 0-9ZM8.5 12h.01"),
    defaultProps: { label: "Enable", on: false },
    defaultStyles: { color: "#5743d9", fontSize: 15 },
    propFields: [f.text("label", "Label", "Switch label"), f.boolean("on", "On by default")],
    styleFields: [f.color("color", "Active color", "#5743d9"), f.number("fontSize", "Font size", 8, 48)],
  },

  {
    type: "listview", label: "ListView", category: "ui", container: false,
    glyph: glyph("M4.5 5.5h15M4.5 10h15M4.5 14.5h15M4.5 19h15"),
    defaultProps: {
      items: "First item\nSecond item\nThird item",
      selection: "",
    },
    defaultStyles: { background: "#ffffff", radius: 10, borderWidth: 1, borderColor: "#e3e6ee", fontSize: 14 },
    propFields: [f.textarea("items", "Items (one per line)", "One item per line"), f.text("selection", "Selected item", "")],
    styleFields: [f.color("background", "Background", "#ffffff"), f.number("radius", "Corner radius", 0, 24), f.color("borderColor", "Border color", "#e3e6ee"), f.number("fontSize", "Font size", 8, 32)],
  },
  {
    type: "notifier", label: "Notifier", category: "ui", container: false,
    glyph: glyph("M12 4.5a5 5 0 0 1 5 5v3l1.5 3h-13l1.5-3v-3a5 5 0 0 1 5-5ZM10 18.5a2 2 0 0 0 4 0"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
  },

  // Layout: scrollable + tabular arrangements
  {
    type: "h-scroll", label: "Horizontal Scroll", category: "layout", container: true,
    glyph: glyph("M4 9.5h13m0 0-3-3m3 3-3 3M20 15H7m0 0 3-3m-3 3 3 3"),
    defaultProps: {},
    defaultStyles: { background: "#f4f5f8", padding: 12, gap: 8, radius: 10 },
    propFields: [],
    styleFields: [...box, ...flex],
  },
  {
    type: "v-scroll", label: "Vertical Scroll", category: "layout", container: true,
    glyph: glyph("M9.5 4v13m0 0-3-3m3 3 3-3M15 20V7m0 0-3 3m3-3 3 3"),
    defaultProps: {},
    defaultStyles: { background: "#f4f5f8", padding: 12, gap: 8, radius: 10 },
    propFields: [],
    styleFields: [...box, ...flex],
  },
  {
    type: "table", label: "Table Arrangement", category: "layout", container: true,
    glyph: glyph("M4.5 4.5h15v15h-15zM4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15"),
    defaultProps: { columns: 2 },
    defaultStyles: { background: "#f4f5f8", padding: 12, gap: 8, radius: 10 },
    propFields: [f.number("columns", "Columns", 1, 6)],
    styleFields: [...box, ...flex],
  },

  // Storage & database
  {
    type: "tinydb", label: "TinyDB", category: "storage", container: false,
    glyph: glyph("M4.5 6.5h15v4h-15zM4.5 13.5h15v4h-15zM7 8.5h.01M7 15.5h.01"),
    defaultProps: { namespace: "default" },
    defaultStyles: {},
    propFields: [f.text("namespace", "Namespace", "default")],
    styleFields: [],
  },
  {
    type: "clouddb", label: "CloudDB", category: "storage", container: false,
    glyph: glyph("M7 17.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.7-1.2A3.8 3.8 0 0 1 17 16.9z"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "CloudDB needs a hosted Redis/Mongo endpoint plus credentials. The architecture (CloudDB store/get blocks with signed connection settings) is defined; the runtime arrives with the backend-connect phase. The preview stays honest meanwhile.",
  },
  {
    type: "file", label: "File", category: "storage", container: false,
    glyph: glyph("M7 4.5h7l4 4v11h-11zM14 4.5v4h4"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "File access needs a per-device sandbox the browser preview cannot touch honestly. The block surface (read/write/append) is designed and ships with the native export phase.",
  },
  {
    type: "webdb", label: "WebDB", category: "storage", container: false,
    glyph: glyph("M12 4.5a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4.5 12h15M12 4.5c-4 4.5-4 10.5 0 15M12 4.5c4 4.5 4 10.5 0 15"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "WebDB stores rows on a hosted service you control (append/replace with your endpoint URL). Architecture defined; the preview shows connection state instead of faking data.",
  },

  // Connectivity
  {
    type: "web", label: "Web", category: "connectivity", container: false,
    glyph: glyph("M12 4.5a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4.5 12h15M12 4.5c-4 4.5-4 10.5 0 15M12 4.5c4 4.5 4 10.5 0 15"),
    defaultProps: { url: "https://api.example.com/data", response: "" },
    defaultStyles: {},
    propFields: [f.text("url", "Default URL", "https://…"), f.text("response", "Last response (read-only)", "")],
    styleFields: [],
  },
  {
    type: "activity-starter", label: "Activity Starter", category: "connectivity", container: false,
    glyph: glyph("M5 12h13m0 0-4-4m4 4-4 4M6 5.5H4.5v13H6"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "Activity Starter launches other Android apps by action/class — meaningless inside a browser preview. It activates in the Android export (real intent wiring), on the export roadmap.",
  },
  {
    type: "bluetooth-client", label: "Bluetooth Client", category: "connectivity", container: false,
    glyph: glyph("M8 7.5 16 16.5l-4 3.5V4.5l4 3.5-8 9"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "Bluetooth needs a device adapter the browser sandbox cannot reach (Web Bluetooth covers only a subset). Connect flow is designed; ships with the native export phase — no faked scanning.",
  },
  {
    type: "bluetooth-server", label: "Bluetooth Server", category: "connectivity", container: false,
    glyph: glyph("M8 7.5 16 16.5l-4 3.5V4.5l4 3.5-8 9M4.5 12h.01"),
    defaultProps: {},
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "Bluetooth Server listens for paired devices — same native-adapter requirement as the client. Designed; ships with the native export phase.",
  },

  // Sensors
  {
    type: "clock", label: "Clock", category: "sensors", container: false,
    glyph: glyph("M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM12 8v4.5l3 1.5"),
    defaultProps: { interval: 1000, enabled: false, pattern: "HH:mm:ss" },
    defaultStyles: {},
    propFields: [f.number("interval", "Timer interval (ms)", 100, 3600000), f.boolean("enabled", "Timer enabled"), f.text("pattern", "Format pattern", "HH:mm:ss")],
    styleFields: [],
  },
  {
    type: "location-sensor", label: "Location Sensor", category: "sensors", container: false,
    glyph: glyph("M12 20s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10ZM13.5 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"),
    defaultProps: { latitude: 0, longitude: 0, available: false },
    defaultStyles: {},
    propFields: [],
    styleFields: [],
  },
  {
    type: "accelerometer-sensor", label: "Accelerometer", category: "sensors", container: false,
    glyph: glyph("M12 3.5v6m0 0 3-3m-3 3-3-3M5 13.5a7 7 0 0 0 14 0M12 13v7"),
    defaultProps: { x: 0, y: 0, z: 0, available: false },
    defaultStyles: {},
    propFields: [],
    styleFields: [],
  },

  // Media & animation
  {
    type: "text-to-speech", label: "Text to Speech", category: "media", container: false,
    glyph: glyph("M4 9.5v5h3l4.5 4v-13l-4.5 4H4zM15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"),
    defaultProps: { language: "en-US" },
    defaultStyles: {},
    propFields: [f.text("language", "Language", "en-US")],
    styleFields: [],
  },
  {
    type: "canvas", label: "Canvas", category: "media", container: false,
    glyph: glyph("M4.5 4.5h15v15h-15zM8 15.5l3-4 2.5 3 2-2.5 2.5 3.5"),
    defaultProps: { background: "#ffffff", lastX: 0, lastY: 0 },
    defaultStyles: { height: 220 },
    propFields: [f.color("background", "Background", "#ffffff")],
    styleFields: [f.number("height", "Height", 80, 600)],
  },
  {
    type: "sound", label: "Sound", category: "media", container: false,
    glyph: glyph("M9 18.5V6l9-2v12.5M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm9-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"),
    defaultProps: { source: "", looping: false },
    defaultStyles: {},
    propFields: [f.text("source", "Source (asset name or URL)", "coin.wav"), f.boolean("looping", "Loop")],
    styleFields: [],
  },
  {
    type: "player", label: "Player", category: "media", container: false,
    glyph: glyph("M8.2 5.6v12.8a.7.7 0 0 0 1.06.6l10.3-6.4a.7.7 0 0 0 0-1.2L9.26 5a.7.7 0 0 0-1.06.6ZM4.5 5.5v13"),
    defaultProps: { source: "" },
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "Player (long-form audio/video with transport controls) is designed on the audio-asset pipeline and ships with the native media phase. Sound blocks (play/stop) already work today.",
  },
  {
    type: "image-sprite", label: "ImageSprite", category: "media", container: false,
    glyph: glyph("M12 4.5c3 0 5.5 2.2 5.5 5 0 1.9-1.2 3.4-2.5 4.3V16h-6v-2.2C7.7 12.9 6.5 11.4 6.5 9.5c0-2.8 2.5-5 5.5-5ZM10 19.5h4"),
    defaultProps: { picture: "", x: 10, y: 10 },
    defaultStyles: {},
    propFields: [],
    styleFields: [],
    designed:
      "ImageSprite needs image-texture support on scene entities (color sprites ship today with the 2D scene runtime). When it ships it becomes a positioned, collidable picture entity.",
  },
];


// ---- Game entities (TASK 08 — the 2D scene/sprite IR) ------------------------
// Entities are real components in the canonical model: transform (x/y/width/
// height), color and visibility live in props, colliders are first-class, and
// a screen that contains any entity is a SCENE — the runtime plays it with a
// real game loop (input → movement → AABB collision → touch events → blocks).

/** Shared transform + collider prop fields for every game entity. */
const entityFields = (extra: FieldDef[] = []): FieldDef[] => [
  f.text("name", "Name"),
  f.text("src", "Texture (asset:<id> or URL)"),
  f.number("x", "X", 0, 4096),
  f.number("y", "Y", 0, 4096),
  f.number("width", "Width", 4, 1024),
  f.number("height", "Height", 4, 1024),
  f.number("rotation", "Rotation °", -180, 180),
  f.boolean("visible", "Visible"),
  f.boolean("collider", "Collider"),
  f.text("layer", "Collision layer", "default"),
  ...extra,
];

COMPONENT_DEFS.push(
  {
    type: "player", label: "Player", category: "game", container: false,
    glyph: glyph("M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-6 18a6 6 0 0 1 12 0"),
    defaultProps: { name: "Player", x: 24, y: 560, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true, layer: "player" },
    defaultStyles: {},
    propFields: entityFields(),
    styleFields: [],
  },
  {
    type: "platform", label: "Platform", category: "game", container: false,
    glyph: glyph("M3 9h18M5 9v9m14-9v9M3 5h18v4H3z"),
    defaultProps: { name: "Platform", x: 24, y: 640, width: 160, height: 20, color: "#2a3348", visible: true, collider: true, layer: "solid" },
    defaultStyles: {},
    propFields: entityFields(),
    styleFields: [],
  },
  {
    type: "coin", label: "Coin", category: "game", container: false,
    glyph: glyph("M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3v10M9.5 9h5"),
    defaultProps: { name: "Coin", x: 120, y: 520, width: 28, height: 28, color: "#ffb454", visible: true, collider: true, trigger: true, layer: "pickup" },
    defaultStyles: {},
    propFields: entityFields([f.boolean("trigger", "Trigger only")]),
    styleFields: [],
  },
  {
    type: "enemy", label: "Enemy", category: "game", container: false,
    glyph: glyph("M5 5h14v12H5zM9 10h.01M15 10h.01M9 14h6"),
    defaultProps: { name: "Enemy", x: 220, y: 560, width: 32, height: 32, color: "#ff7d9c", visible: true, collider: true, trigger: true, layer: "hazard" },
    defaultStyles: {},
    propFields: entityFields([f.boolean("trigger", "Trigger only")]),
    styleFields: [],
  },
  {
    type: "trigger", label: "Trigger Zone", category: "game", container: false,
    glyph: glyph("M4 4h16v16H4zm5 5h6v6H9z"),
    defaultProps: { name: "Trigger Zone", x: 260, y: 480, width: 100, height: 80, color: "#8f7bff", visible: true, collider: true, trigger: true, layer: "zone" },
    defaultStyles: {},
    propFields: entityFields([f.boolean("trigger", "Trigger only")]),
    styleFields: [],
  },
  {
    type: "sprite", label: "Sprite", category: "game", container: false,
    glyph: glyph("M4 5h16v14H4zM8 15l3-4 2.5 3L16 11l4 6"),
    defaultProps: { name: "Sprite", x: 160, y: 300, width: 48, height: 48, color: "#58c7f0", visible: true, collider: false, layer: "default" },
    defaultStyles: {},
    propFields: entityFields(),
    styleFields: [],
  },
);

/** Component types that behave as scene entities (TASK 08). */
export const ENTITY_TYPES: ReadonlySet<string> = new Set([
  "player", "platform", "coin", "enemy", "trigger", "sprite",
]);

/**
 * Translated block label (TASK 10): the ID dictionary carries templates with
 * the same {placeholder} tokens; untranslated types fall back to the English
 * def.label. `t` comes from useI18n; the key-miss detection relies on t()
 * returning the key itself for unknown entries.
 */
export function translatedBlockLabel(
  def: { type: string; label: string },
  t: (key: string) => string,
): string {
  const translated = t(`block.${def.type}`);
  return translated === `block.${def.type}` ? def.label : translated;
}

/** Translated event label; falls back to the English EVENT_LABELS entry. */
export function translatedEventLabel(event: string, t: (key: string) => string): string {
  const translated = t(`block.event.${event}`);
  return translated === `block.event.${event}` ? EVENT_LABELS[event] ?? event : translated;
}

/** Translated category label. */
export function translatedCategoryLabel(category: string, t: (key: string) => string): string {
  const translated = t(`block.category.${category}`);
  return translated === `block.category.${category}` ? (CATEGORY_LABELS as Record<string, string>)[category] ?? category : translated;
}

/** Label for any event name, including dynamic scene touch events. */
export function eventLabel(event: string): string {
  if (event.startsWith("touches-")) return "Touches"; // target resolved by the UI
  return EVENT_LABELS[event] ?? event;
}

/** Category display order and labels. */
export const CATEGORY_ORDER: { id: ComponentCategory; label: string }[] = [
  { id: "game", label: "Game Entities" },
  { id: "ui", label: "User Interface" },
  { id: "layout", label: "Layout" },
  { id: "storage", label: "Storage & Database" },
  { id: "connectivity", label: "Connectivity" },
  { id: "sensors", label: "Sensors" },
  { id: "media", label: "Media & Animation" },
];

const defsByType = new Map(COMPONENT_DEFS.map((def) => [def.type, def]));

/** Look up a component definition; unknown types render a fallback box. */
export function getDef(type: string): ComponentDef | undefined {
  return defsByType.get(type);
}

/** Style/prop keys the renderer understands (anything else is preserved). */
export const KNOWN_STYLE_KEYS = new Set(
  COMPONENT_DEFS.flatMap((def) => def.styleFields.map((field) => field.key)),
);
