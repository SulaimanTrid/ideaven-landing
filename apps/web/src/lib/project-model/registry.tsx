import type { ComponentType, SVGProps } from "react";
import type { PropsMap } from "@/types/project";

/**
 * The Ideaven component registry. Every builder surface — palette, canvas
 * renderer, component tree, inspector — reads from these definitions, so a
 * component type exists exactly once and always renders for real. Types are
 * added here only when the canvas renderer and inspector schema for them are
 * complete; nothing in the palette is decorative.
 */

export type ComponentCategory = "layout" | "ui" | "input";

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
    type: "text-input", label: "Text Input", category: "input", container: false,
    glyph: glyph("M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7ZM7.5 9.5h6"),
    defaultProps: { placeholder: "Enter text", value: "" },
    defaultStyles: { background: "#ffffff", color: "#0b0e16", borderColor: "#c9cede", radius: 10, padding: 12 },
    propFields: [f.text("placeholder", "Placeholder", "Hint text"), f.text("value", "Initial value")],
    styleFields: [f.color("background", "Background", "#ffffff"), f.color("color", "Text color", "#0b0e16"), f.color("borderColor", "Border color", "#c9cede"), f.number("radius", "Corner radius", 0, 24), f.number("padding", "Padding", 4, 32)],
  },
  {
    type: "password-input", label: "Password Input", category: "input", container: false,
    glyph: glyph("M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7ZM9 12h.01M12 12h.01M15 12h.01"),
    defaultProps: { placeholder: "Enter password", value: "" },
    defaultStyles: { background: "#ffffff", color: "#0b0e16", borderColor: "#c9cede", radius: 10, padding: 12 },
    propFields: [f.text("placeholder", "Placeholder", "Hint text")],
    styleFields: [f.color("background", "Background", "#ffffff"), f.color("color", "Text color", "#0b0e16"), f.color("borderColor", "Border color", "#c9cede"), f.number("radius", "Corner radius", 0, 24), f.number("padding", "Padding", 4, 32)],
  },
  {
    type: "checkbox", label: "Checkbox", category: "input", container: false,
    glyph: glyph("M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5v-9ZM9 12l2.2 2.2L15.5 10"),
    defaultProps: { label: "Check me", checked: false },
    defaultStyles: { color: "#0b0e16", fontSize: 15 },
    propFields: [f.text("label", "Label", "Checkbox label"), f.boolean("checked", "Checked by default")],
    styleFields: [f.color("color", "Text color", "#0b0e16"), f.number("fontSize", "Font size", 8, 48)],
  },
  {
    type: "switch", label: "Switch", category: "input", container: false,
    glyph: glyph("M8.5 7.5h7a4.5 4.5 0 0 1 0 9h-7a4.5 4.5 0 0 1 0-9ZM8.5 12h.01"),
    defaultProps: { label: "Enable", on: false },
    defaultStyles: { color: "#5743d9", fontSize: 15 },
    propFields: [f.text("label", "Label", "Switch label"), f.boolean("on", "On by default")],
    styleFields: [f.color("color", "Active color", "#5743d9"), f.number("fontSize", "Font size", 8, 48)],
  },
];

/** Category display order and labels. */
export const CATEGORY_ORDER: { id: ComponentCategory; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "ui", label: "User Interface" },
  { id: "input", label: "Input" },
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
