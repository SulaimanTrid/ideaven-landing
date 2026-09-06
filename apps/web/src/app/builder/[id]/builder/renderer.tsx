"use client";

import { type CSSProperties, type DragEvent } from "react";
import { imageUrl } from "@/lib/api";
import { getDef } from "@/lib/project-model/registry";
import { CANVAS_ICON_PATHS } from "@/lib/project-model/icon-paths";
import { locateComponent } from "@/lib/project-model/ops";
import { useBuilder } from "./builder-context";
import type { ProjectModelComponent, PropsMap } from "@/types/project";

/**
 * The canvas renderer: draws the real component tree from the Project Model
 * with selection, drag-and-drop (palette → canvas, node → node reordering
 * and nesting), and inline drop indicators. Every visual property shown here
 * comes from the model — the canvas is the project, not a mock.
 */

// ---- model styles → CSS ------------------------------------------------------

function px(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string" && value.trim() !== "") return value;
  return fallback;
}

function flexValue(value: unknown): string | undefined {
  switch (value) {
    case "start": return "flex-start";
    case "end": return "flex-end";
    case "between": return "space-between";
    case "center": return "center";
    case "stretch": return "stretch";
    default: return undefined;
  }
}

/** Convert a model styles map to inline CSS. Unknown keys are ignored. */
export function cssFor(styles: PropsMap | undefined): CSSProperties {
  const css: CSSProperties = {};
  if (!styles) return css;

  if (typeof styles.background === "string") css.backgroundColor = styles.background;
  if (typeof styles.color === "string") css.color = styles.color;
  const fontSize = px(styles.fontSize);
  if (fontSize) css.fontSize = fontSize;
  if (typeof styles.fontWeight === "string" || typeof styles.fontWeight === "number") {
    css.fontWeight = styles.fontWeight as CSSProperties["fontWeight"];
  }
  if (typeof styles.textAlign === "string") css.textAlign = styles.textAlign as CSSProperties["textAlign"];
  const padding = px(styles.padding);
  if (padding) css.padding = padding;
  const radius = px(styles.radius);
  if (radius) css.borderRadius = radius;
  const borderWidth = typeof styles.borderWidth === "number" ? styles.borderWidth : undefined;
  if (borderWidth && borderWidth > 0) {
    css.borderStyle = "solid";
    css.borderWidth = `${borderWidth}px`;
    css.borderColor = typeof styles.borderColor === "string" ? styles.borderColor : "#d5d9e2";
  }
  const gap = px(styles.gap);
  if (gap) css.gap = gap;
  const align = flexValue(styles.align);
  if (align) css.alignItems = align;
  const justify = flexValue(styles.justify);
  if (justify) css.justifyContent = justify;
  const width = px(styles.width);
  if (width) css.width = width;
  const height = px(styles.height);
  if (height) css.height = height;
  if (styles.fit === "contain" || styles.fit === "cover") css.objectFit = styles.fit;
  const margin = px(styles.margin);
  if (margin) css.margin = margin;
  if (styles.grow === true) css.flexGrow = 1;
  return css;
}

// ---- drop geometry -------------------------------------------------------------

/** Layout axis a parent uses to arrange its children. */
export function axisOf(parentType: string | null): "v" | "h" {
  return parentType === "row" ? "h" : "v";
}

/** First child whose midpoint is past the pointer defines the insert index. */
function indexByPointer(children: Element[], x: number, y: number, axis: "v" | "h"): number {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) continue;
    const rect = child.getBoundingClientRect();
    const mid = axis === "v" ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    if ((axis === "v" ? y : x) < mid) return index;
  }
  return children.length;
}

/** Line geometry between children[index-1] and children[index], parent-relative. */
function lineRectFor(
  el: Element,
  kids: Element[],
  index: number,
  axis: "v" | "h",
): { x: number; y: number; w: number; h: number } {
  const parentRect = el.getBoundingClientRect();
  const gap = 4;
  const first = kids[0];
  const last = kids[kids.length - 1];
  if (index === 0 && first) {
    const rect = first.getBoundingClientRect();
    return axis === "v"
      ? { x: 0, y: Math.max(0, rect.top - parentRect.top - gap), w: parentRect.width, h: 3 }
      : { x: Math.max(0, rect.left - parentRect.left - gap), y: 0, w: 3, h: parentRect.height };
  }
  if (index >= kids.length && last) {
    const rect = last.getBoundingClientRect();
    return axis === "v"
      ? { x: 0, y: rect.bottom - parentRect.top + gap, w: parentRect.width, h: 3 }
      : { x: rect.right - parentRect.left + gap, y: 0, w: 3, h: parentRect.height };
  }
  const prev = kids[index - 1];
  const next = kids[index];
  if (prev && next) {
    const a = prev.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return axis === "v"
      ? { x: 0, y: (a.bottom + b.top) / 2 - parentRect.top, w: parentRect.width, h: 3 }
      : { x: (a.right + b.left) / 2 - parentRect.left, y: 0, w: 3, h: parentRect.height };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

/** Edge line before/after a leaf node, relative to its parent element. */
function edgeLineFor(
  el: Element,
  axis: "v" | "h",
  before: boolean,
): { x: number; y: number; w: number; h: number } {
  const parentEl = el.parentElement;
  if (!parentEl) return { x: 0, y: 0, w: 0, h: 0 };
  const rect = el.getBoundingClientRect();
  const parentRect = parentEl.getBoundingClientRect();
  const gap = 2;
  return axis === "v"
    ? { x: 0, y: (before ? rect.top : rect.bottom) - parentRect.top - gap + 1, w: parentRect.width, h: 3 }
    : { x: (before ? rect.left : rect.right) - parentRect.left - gap + 1, y: 0, w: 3, h: parentRect.height };
}

// ---- rendering -------------------------------------------------------------------

function CanvasIcon({ name, styles }: { name: unknown; styles?: PropsMap }) {
  const path = typeof name === "string" ? CANVAS_ICON_PATHS[name] : undefined;
  const size = typeof styles?.fontSize === "number" ? styles.fontSize : 24;
  if (!path) {
    return <span style={{ fontSize: size * 0.5, color: "#8a91a3" }}>?</span>;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function UnknownComponent({ node }: { node: ProjectModelComponent }) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px dashed #c9cede",
        borderRadius: 8,
        color: "#8a91a3",
        fontSize: 13,
      }}
    >
      Unknown component “{node.type}”
    </div>
  );
}

/** Absolutely-positioned drop indicator; rendered by the active parent. */
export function DropLine({ containerId, screenId }: { containerId: string | null; screenId: string }) {
  const { indicator } = useBuilder();
  if (!indicator) return null;
  if (indicator.parentId !== containerId || indicator.screenId !== screenId) return null;

  if (indicator.mode === "into") {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 6, right: 6, top: 6, bottom: 6,
          border: "2px dashed #8f7bff",
          borderRadius: 10,
          pointerEvents: "none",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: indicator.x,
        top: indicator.y,
        width: indicator.w,
        height: indicator.h,
        background: "#8f7bff",
        borderRadius: 2,
        pointerEvents: "none",
        boxShadow: "0 0 0 1px rgb(255 255 255 / 0.6)",
      }}
    />
  );
}

/**
 * Renders one model component as real DOM with selection + drag handlers.
 * `parentAxis` is the layout direction of the parent arranging this node.
 */
export function ComponentNode({
  node,
  screenId,
  parentId,
  parentAxis,
}: {
  node: ProjectModelComponent;
  screenId: string;
  parentId: string | null;
  parentAxis: "v" | "h";
}) {
  const { model, selectedId, select, setIndicator, draggingRef, applyDrop } = useBuilder();
  const def = getDef(node.type);
  const props = node.props ?? {};
  const styles = node.styles ?? {};
  const selected = selectedId === node.id;
  const isContainer = Boolean(def?.container);

  const onSelect = (event: React.MouseEvent) => {
    event.stopPropagation();
    select(node.id);
  };

  const onDragStart = (event: React.DragEvent) => {
    event.stopPropagation();
    draggingRef.current = { kind: "move", componentId: node.id, screenId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  };

  const onDragOver = (event: DragEvent) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";

    const el = event.currentTarget;

    if (isContainer) {
      // Containers accept children: index among children by pointer position.
      const kids = Array.from(el.children).filter(
        (child) => child.getAttribute("data-node-id") !== null,
      );
      if (kids.length === 0) {
        setIndicator({
          parentId: node.id, screenId, index: 0,
          x: 6, y: 6, w: 0, h: 0, horizontal: false, mode: "into",
        });
        return;
      }
      const innerAxis = node.type === "row" ? "h" : "v";
      const index = indexByPointer(kids, event.clientX, event.clientY, innerAxis);
      const line = lineRectFor(el, kids, index, innerAxis);
      setIndicator({ parentId: node.id, screenId, index, ...line, horizontal: innerAxis === "h", mode: "line" });
      return;
    }

    // Leaves: insert before/after within their parent.
    const rect = el.getBoundingClientRect();
    const before =
      parentAxis === "v"
        ? event.clientY < rect.top + rect.height / 2
        : event.clientX < rect.left + rect.width / 2;
    const ownIndex = locateComponent(model, node.id)?.index ?? 0;
    const line = edgeLineFor(el, parentAxis, before);
    setIndicator({
      parentId, screenId, index: ownIndex + (before ? 0 : 1),
      ...line, horizontal: parentAxis === "v", mode: "line",
    });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    applyDrop();
  };

  const interactive: CSSProperties = {
    ...cssFor(styles),
    position: "relative",
    outline: selected ? "2px solid #8f7bff" : undefined,
    outlineOffset: selected ? 1 : undefined,
  };

  const handlers = {
    "data-node-id": node.id,
    "data-container": isContainer ? "1" : "0",
    draggable: true,
    onDragStart,
    onDragOver,
    onDrop,
    onClick: onSelect,
  } as const;

  const children = node.children ?? [];

  if (!def) {
    return <div {...handlers} style={interactive}><UnknownComponent node={node} /></div>;
  }

  switch (node.type) {
    case "column":
    case "container":
    case "card":
      return (
        <div
          {...handlers}
          style={{
            ...interactive,
            display: "flex",
            flexDirection: "column",
            boxShadow: node.type === "card" ? "0 1px 3px rgb(16 24 40 / 0.08)" : undefined,
            minWidth: 0,
          }}
        >
          {children.map((child) => (
            <ComponentNode
              key={child.id}
              node={child}
              screenId={screenId}
              parentId={node.id}
              parentAxis="v"
            />
          ))}
          <DropLine containerId={node.id} screenId={screenId} />
        </div>
      );
    case "row":
      return (
        <div
          {...handlers}
          style={{ ...interactive, display: "flex", flexDirection: "row", minWidth: 0 }}
        >
          {children.map((child) => (
            <ComponentNode
              key={child.id}
              node={child}
              screenId={screenId}
              parentId={node.id}
              parentAxis="h"
            />
          ))}
          <DropLine containerId={node.id} screenId={screenId} />
        </div>
      );
    case "text":
      return (
        <div {...handlers} style={{ ...interactive, whiteSpace: "pre-wrap", minWidth: 0 }}>
          {typeof props.text === "string" ? props.text : ""}
        </div>
      );
    case "button":
      return (
        <div
          {...handlers}
          style={{
            ...interactive,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "flex-start",
            userSelect: "none",
            minWidth: 0,
          }}
        >
          {typeof props.label === "string" ? props.label : "Button"}
        </div>
      );
    case "icon":
      return (
        <div {...handlers} style={{ ...interactive, display: "inline-flex", alignSelf: "flex-start" }}>
          <CanvasIcon name={props.name} styles={styles} />
        </div>
      );
    case "image": {
      // "asset:<id>" resolves through the authenticated raw endpoint; other
      // values are external URLs used as-is.
      const src = typeof props.src === "string" ? imageUrl(props.src) : "";
      const width = px(styles.width, "200px");
      const height = px(styles.height, "140px");
      if (src === "") {
        return (
          <div
            {...handlers}
            style={{
              ...interactive,
              width,
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f0f1f5",
              border: "1px dashed #c9cede",
              color: "#8a91a3",
              fontSize: 13,
            }}
          >
            Image — set a URL
          </div>
        );
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element -- renders arbitrary model URLs inside the user's own canvas
        <img
          {...handlers}
          src={src}
          alt={typeof props.alt === "string" ? props.alt : ""}
          style={{ ...interactive, width, height, background: "#f0f1f5" }}
        />
      );
    }
    case "text-input":
    case "password-input":
      return (
        <input
          {...handlers}
          type={node.type === "password-input" ? "password" : "text"}
          placeholder={typeof props.placeholder === "string" ? props.placeholder : ""}
          defaultValue={typeof props.value === "string" ? props.value : undefined}
          readOnly
          style={{ ...interactive, alignSelf: "stretch" }}
        />
      );
    case "checkbox":
      return (
        <label {...handlers} style={{ ...interactive, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            defaultChecked={props.checked === true}
            readOnly
            style={{ width: 16, height: 16, accentColor: "#5743d9", pointerEvents: "none" }}
          />
          <span style={{ fontSize: px(styles.fontSize, "15px") }}>
            {typeof props.label === "string" ? props.label : ""}
          </span>
        </label>
      );
    case "switch": {
      const on = props.on === true;
      const active = typeof styles.color === "string" ? styles.color : "#5743d9";
      return (
        <div {...handlers} style={{ ...interactive, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              background: on ? active : "#c9cede",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: on ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: 9,
                background: "#ffffff",
                boxShadow: "0 1px 2px rgb(16 24 40 / 0.25)",
              }}
            />
          </span>
          <span style={{ fontSize: px(styles.fontSize, "15px") }}>
            {typeof props.label === "string" ? props.label : ""}
          </span>
        </div>
      );
    }
    case "divider": {
      const thickness = typeof styles.thickness === "number" ? styles.thickness : 1;
      return (
        <div
          {...handlers}
          style={{
            ...interactive,
            height: thickness,
            background: typeof styles.color === "string" ? styles.color : "#e3e6ee",
            alignSelf: "stretch",
          }}
        />
      );
    }
    case "spacer":
      return (
        <div
          {...handlers}
          style={{
            ...interactive,
            height: px(styles.height, "24px"),
            background: "repeating-linear-gradient(45deg,#f6f7fa,#f6f7fa 6px,#eef0f4 6px,#eef0f4 12px)",
            borderRadius: 6,
          }}
        />
      );
    default:
      return <div {...handlers} style={interactive}><UnknownComponent node={node} /></div>;
  }
}
