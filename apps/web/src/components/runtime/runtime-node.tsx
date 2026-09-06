"use client";

import { cssFor } from "@/app/builder/[id]/builder/renderer";
import { imageUrl } from "@/lib/api";
import { getDef } from "@/lib/project-model/registry";
import { CANVAS_ICON_PATHS } from "@/lib/project-model/icon-paths";
import type { ProjectModelComponent, PropsMap } from "@/types/project";

/**
 * One interactive node of the live runtime rendering — the exact tree that
 * Preview mode uses. Shared with the public published-app page (roadmap 19)
 * so a published project executes the same model, the same way.
 */

export interface RuntimeNodeProps {
  node: ProjectModelComponent;
  runtime: import("@/lib/project-model/runtime").ScreenRuntime | null;
  emit: (componentId: string | null, event: string) => void;
  setProps: (componentId: string, patch: PropsMap) => void;
}

export function RuntimeNode({ node, runtime, emit, setProps }: RuntimeNodeProps) {
  const def = getDef(node.type);
  const styles = node.styles ?? {};
  const base = cssFor(styles);
  const props: PropsMap = runtime?.getComponentProps(node.id) ?? node.props ?? {};

  if (!def) {
    return <div style={{ ...base, color: "#8a91a3", fontSize: 13, padding: 12 }}>Unknown “{node.type}”</div>;
  }

  const icon = () => {
    const path = typeof props.name === "string" ? CANVAS_ICON_PATHS[props.name] : undefined;
    const size = typeof styles.fontSize === "number" ? styles.fontSize : 24;
    return path ? (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    ) : (
      <span style={{ fontSize: size * 0.5, color: "#8a91a3" }}>?</span>
    );
  };

  switch (node.type) {
    case "column":
    case "container":
    case "card":
      return (
        <div
          style={{
            ...base,
            display: "flex",
            flexDirection: "column",
            boxShadow: node.type === "card" ? "0 1px 3px rgb(16 24 40 / 0.08)" : undefined,
            minWidth: 0,
          }}
        >
          {(node.children ?? []).map((child) => (
            <RuntimeNode key={child.id} node={child} runtime={runtime} emit={emit} setProps={setProps} />
          ))}
        </div>
      );
    case "row":
      return (
        <div style={{ ...base, display: "flex", flexDirection: "row", minWidth: 0 }}>
          {(node.children ?? []).map((child) => (
            <RuntimeNode key={child.id} node={child} runtime={runtime} emit={emit} setProps={setProps} />
          ))}
        </div>
      );
    case "text":
      return <div style={{ ...base, whiteSpace: "pre-wrap", minWidth: 0 }}>{String(props.text ?? "")}</div>;
    case "button":
      return (
        <button
          type="button"
          onClick={() => emit(node.id, "click")}
          style={{
            ...base,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "flex-start",
            userSelect: "none",
            cursor: "pointer",
            border: "none",
          }}
        >
          {String(props.label ?? "")}
        </button>
      );
    case "icon":
      return <span style={{ ...base, display: "inline-flex", alignSelf: "flex-start" }}>{icon()}</span>;
    case "image": {
      // "asset:<id>" resolves through the raw endpoint. On the public page
      // the visitor has no session, so project assets stay private — external
      // URLs render, stored assets show as unset rather than leaking bytes.
      const src = imageUrl(String(props.src ?? ""));
      const w = px(styles.width, "200px");
      const h = px(styles.height, "140px");
      if (src === "") {
        return (
          <div
            style={{
              ...base,
              width: w,
              height: h,
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
      // eslint-disable-next-line @next/next/no-img-element -- renders arbitrary model URLs inside the user's own preview
      return <img src={src} alt={String(props.alt ?? "")} style={{ ...base, width: w, height: h, background: "#f0f1f5" }} />;
    }
    case "text-input":
    case "password-input":
      return (
        <input
          type={node.type === "password-input" ? "password" : "text"}
          value={String(props.value ?? "")}
          placeholder={String(props.placeholder ?? "")}
          onChange={(event) => {
            setProps(node.id, { value: event.target.value });
            emit(node.id, "change");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") emit(node.id, "enter");
          }}
          style={{ ...base, alignSelf: "stretch" }}
        />
      );
    case "checkbox":
      return (
        <label style={{ ...base, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={props.checked === true}
            onChange={(event) => {
              setProps(node.id, { checked: event.target.checked });
              emit(node.id, "change");
            }}
            style={{ width: 16, height: 16, accentColor: "#5743d9" }}
          />
          <span style={{ fontSize: px(styles.fontSize, "15px") }}>{String(props.label ?? "")}</span>
        </label>
      );
    case "switch": {
      const on = props.on === true;
      const active = typeof styles.color === "string" ? styles.color : "#5743d9";
      return (
        <button
          type="button"
          aria-pressed={on}
          onClick={() => {
            setProps(node.id, { on: !on });
            emit(node.id, "change");
          }}
          style={{
            ...base,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <span style={{ width: 40, height: 22, borderRadius: 11, background: on ? active : "#c9cede", position: "relative" }}>
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
          <span style={{ fontSize: px(styles.fontSize, "15px"), color: "#0b0e16" }}>{String(props.label ?? "")}</span>
        </button>
      );
    }
    case "divider":
      return (
        <div
          style={{
            ...base,
            height: typeof styles.thickness === "number" ? styles.thickness : 1,
            background: typeof styles.color === "string" ? styles.color : "#e3e6ee",
            alignSelf: "stretch",
          }}
        />
      );
    case "spacer":
      return <div style={base} />;
    default:
      return <div style={{ ...base, color: "#8a91a3", fontSize: 13, padding: 12 }}>Unknown “{node.type}”</div>;
  }
}

function px(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string" && value.trim() !== "") return value;
  return fallback;
}
