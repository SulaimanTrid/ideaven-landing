import { cn } from "@ideaven/ui";

/**
 * TASK 61: ONE creation-preview system for the three real creation
 * environments. Deterministic inline SVG — no raster assets, no second
 * renderer, no fake screenshots. Every scene borrows its palette and chrome
 * from the REAL engines it represents:
 *
 * - app  → the app builder's white device screen, #5743d9 buttons, and the
 *          violet selection outline (the editing metaphor)
 * - game → the 2D scene stage: #0c0f17 + dot grid, player #46e3b4,
 *          platform #2a3348, coin #ffb454, dashed violet camera framing
 *          (dashed = guides, per the design constitution), shell corner ticks
 * - 3d   → the actual 3D editor viewport: flat-shaded primitives (cube
 *          #58c7f0 tri-tone like shadeFace3D), violet grid, warm light gizmo
 *          (marker + influence ring), dashed camera frustum, corner ticks
 *
 * The scenes communicate the ENVIRONMENT, not invented capabilities — no GLB,
 * PBR, terrain, or gameplay statistics are implied anywhere.
 *
 * Asset contract: external raster/vector art (if ever produced) lives under
 * `public/ideaven/creation-previews/` and MUST be consumed through this one
 * component — pages never hardcode preview images or dimensions themselves.
 * Inline SVG keeps the previews crisp at any DPI and impossible to 404.
 */

export type CreationPreviewType = "app" | "game" | "3d";

const PREVIEW_LABELS: Record<CreationPreviewType, string> = {
  app: "Miniature preview of the Ideaven App Builder: a phone screen with UI cards, a primary button, and a violet selection outline",
  game: "Miniature preview of the Ideaven 2D Game Engine: a player on platforms with coins and a dashed camera frame",
  "3d": "Miniature preview of the Ideaven 3D Game Builder: a lit cube, sphere and ground plane on a grid with a camera frustum and a point light",
};

export function CreationPreview({
  type,
  className,
}: {
  type: CreationPreviewType;
  /** Extra classes for the OUTER box — size it from the parent (h-24, h-28…). */
  className?: string;
}) {
  return (
    <div
      data-creation-preview={type}
      role="img"
      aria-label={PREVIEW_LABELS[type]}
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-[#0a0c12]",
        className,
      )}
    >
      {/* Wide 480x200 stage: preserveAspectRatio meet fills wide preview cards
          without cropping or stretching any scene content. */}
      <svg
        viewBox="0 0 480 200"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        {type === "app" ? <AppScene /> : type === "game" ? <GameScene /> : <Scene3D />}
      </svg>
    </div>
  );
}

/** Shared background: canvas tone + the faint dot grid the editor shells use.
 * `uid` keeps the SVG pattern ids unique when several previews share a page. */
function SceneBackdrop({ uid }: { uid: string }) {
  const id = `preview-dots-${uid}`;
  return (
    <>
      <rect width="480" height="200" fill="#0a0c12" />
      <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="rgb(255 255 255 / 0.05)" />
      </pattern>
      <rect width="480" height="200" fill={`url(#${id})`} />
    </>
  );
}

/** The game-shell corner ticks (violet hairlines) used by the real stage. */
function CornerTicks() {
  const stroke = "rgb(143 123 255 / 0.5)";
  return (
    <>
      <path d="M12 22 v-10 h10" fill="none" stroke={stroke} strokeWidth="1.5" />
      <path d="M468 178 v10 h-10" fill="none" stroke={stroke} strokeWidth="1.5" />
    </>
  );
}

/** APP: a miniature app under active editing — phone, UI cards, primary
 * button, the violet selection outline with corner handles, and the
 * inspector metaphor at the right. */
function AppScene() {
  return (
    <>
      <SceneBackdrop uid="app" />
      {/* phone presentation box */}
      <rect x="198" y="22" width="84" height="156" rx="14" fill="#1a1f2e" />
      <rect x="204" y="28" width="72" height="144" rx="9" fill="#ffffff" />
      {/* app top bar */}
      <path d="M204 28 h72 v14 h-72 z" fill="#f3f5f9" />
      <circle cx="211" cy="35" r="2" fill="#c9cede" />
      <circle cx="218" cy="35" r="2" fill="#c9cede" />
      <rect x="230" y="32" width="34" height="6" rx="2" fill="#e3e6ee" />
      {/* screen content: heading bar, cards, primary button */}
      <rect x="211" y="50" width="40" height="7" rx="2.5" fill="#5743d9" />
      <rect x="211" y="64" width="58" height="22" rx="5" fill="#ffffff" stroke="#e3e6ee" />
      <rect x="216" y="70" width="30" height="4" rx="2" fill="#e3e6ee" />
      <rect x="216" y="77" width="44" height="4" rx="2" fill="#eef0f5" />
      <rect x="211" y="92" width="58" height="22" rx="5" fill="#ffffff" stroke="#e3e6ee" />
      <rect x="216" y="98" width="24" height="4" rx="2" fill="#e3e6ee" />
      <rect x="216" y="105" width="38" height="4" rx="2" fill="#eef0f5" />
      {/* the SELECTED element: primary button + violet selection + handles */}
      <rect x="211" y="122" width="34" height="13" rx="4" fill="#5743d9" />
      <rect
        x="207.5"
        y="118.5"
        width="41"
        height="20"
        fill="none"
        stroke="#8f7bff"
        strokeWidth="1.5"
      />
      {(
        [
          [207.5, 118.5],
          [248.5, 118.5],
          [207.5, 138.5],
          [248.5, 138.5],
        ] as [number, number][]
      ).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 2} y={y - 2} width="4" height="4" fill="#8f7bff" />
      ))}
      {/* nav dots */}
      <circle cx="230" cy="160" r="2" fill="#c9cede" />
      <circle cx="240" cy="160" r="2" fill="#5743d9" />
      <circle cx="250" cy="160" r="2" fill="#c9cede" />
      {/* the signature block motif, quiet, bottom-left */}
      <path
        d="M78 148 h34 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-38 a4 4 0 0 1 -4 -4 v-6 a4 4 0 0 1 4 -4 h2 z"
        fill="rgb(143 123 255 / 0.28)"
      />
      <path d="M80 155 h24" stroke="rgb(242 241 234 / 0.55)" strokeWidth="2.5" strokeLinecap="round" />
      {/* a second stacked block behind it (the connectable vocabulary) */}
      <path
        d="M86 128 h30 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-34 a4 4 0 0 1 -4 -4 v-6 a4 4 0 0 1 4 -4 h2 z"
        fill="rgb(70 227 180 / 0.22)"
      />
      {/* inspector metaphor at the right: panel rows + a value pill */}
      <rect x="330" y="48" width="118" height="10" rx="3" fill="#12151f" stroke="rgb(255 255 255 / 0.08)" />
      <rect x="336" y="51" width="30" height="3" rx="1.5" fill="#6f7789" />
      <rect x="330" y="64" width="118" height="30" rx="4" fill="#12151f" stroke="rgb(255 255 255 / 0.08)" />
      <rect x="337" y="71" width="38" height="3.5" rx="1.75" fill="#3a4157" />
      <rect x="337" y="79" width="52" height="8" rx="2.5" fill="#0a0c12" stroke="rgb(255 255 255 / 0.12)" />
      <rect x="330" y="100" width="118" height="30" rx="4" fill="#12151f" stroke="rgb(255 255 255 / 0.08)" />
      <rect x="337" y="107" width="46" height="3.5" rx="1.75" fill="#3a4157" />
      <rect x="337" y="115" width="34" height="8" rx="2.5" fill="#0a0c12" stroke="rgb(143 123 255 / 0.4)" />
      <CornerTicks />
    </>
  );
}

/** 2D GAME: the real scene vocabulary — mint player on slate platforms,
 * amber coins, dashed violet camera framing, stage corner ticks. */
function GameScene() {
  return (
    <>
      <rect width="480" height="200" fill="#0c0f17" />
      <pattern id="preview-dots-game" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="rgb(255 255 255 / 0.06)" />
      </pattern>
      <rect width="480" height="200" fill="url(#preview-dots-game)" />
      {/* ground + floating platforms (platform #2a3348) */}
      <rect x="0" y="158" width="212" height="12" rx="3" fill="#2a3348" />
      <rect x="292" y="158" width="188" height="12" rx="3" fill="#2a3348" />
      <rect x="150" y="112" width="92" height="10" rx="3" fill="#2a3348" />
      <rect x="330" y="86" width="76" height="10" rx="3" fill="#2a3348" />
      {/* player (#46e3b4 rounded square) + coins (#ffb454) */}
      <rect x="86" y="132" width="26" height="26" rx="6" fill="#46e3b4" />
      <rect x="92" y="138" width="6" height="6" rx="2" fill="#0c0f17" opacity="0.55" />
      <circle cx="192" cy="88" r="8" fill="#ffb454" />
      <circle cx="192" cy="88" r="4.5" fill="none" stroke="#0c0f17" strokeWidth="1.5" opacity="0.5" />
      <circle cx="368" cy="60" r="8" fill="#ffb454" />
      <circle cx="368" cy="60" r="4.5" fill="none" stroke="#0c0f17" strokeWidth="1.5" opacity="0.5" />
      {/* dashed violet camera viewport — framing, not an object */}
      <rect
        x="70"
        y="62"
        width="130"
        height="106"
        fill="none"
        stroke="rgb(143 123 255 / 0.75)"
        strokeWidth="1.5"
        strokeDasharray="6 5"
        rx="4"
      />
      <path d="M70 70 v-8 h8" fill="none" stroke="rgb(143 123 255 / 0.9)" strokeWidth="2" />
      <path d="M200 168 v8 h-8" fill="none" stroke="rgb(143 123 255 / 0.9)" strokeWidth="2" />
      <CornerTicks />
    </>
  );
}

/** 3D: the actual viewport language — flat-shaded primitives on a violet
 * grid floor, a warm point-light gizmo (marker + influence ring), and a
 * dashed camera frustum. */
function Scene3D() {
  return (
    <>
      <rect width="480" height="200" fill="#0c0f17" />
      {/* ground plane (the editor's flat plane quad) */}
      <path d="M120 130 L260 90 L430 132 L260 178 Z" fill="#1d2333" />
      {/* grid floor — violet hairlines, the editor's rgba(143,123,255,.16) */}
      <g stroke="rgb(143 123 255 / 0.35)" strokeWidth="1">
        <path d="M162 116 L302 158" />
        <path d="M204 103 L344 145" />
        <path d="M246 90 L386 132" />
        <path d="M186 130 L326 96" />
        <path d="M150 143 L290 109" />
        <path d="M118 156 L258 122" />
      </g>
      {/* the cube: three flat-shaded faces (#58c7f0 family, like the renderer) */}
      <path d="M216 62 L244 50 L272 62 L244 75 Z" fill="#7fd8f5" />
      <path d="M216 62 L244 75 L244 117 L216 104 Z" fill="#58c7f0" />
      <path d="M244 75 L272 62 L272 104 L244 117 Z" fill="#3d92ba" />
      {/* sphere primitive, two-tone */}
      <circle cx="346" cy="108" r="16" fill="#58c7f0" />
      <path d="M346 92 a16 16 0 0 1 13.5 24.5 a20 20 0 0 0 -13.5 -24.5" fill="#7fd8f5" opacity="0.9" />
      {/* point light gizmo: warm marker + influence ring (editor-only language) */}
      <circle cx="150" cy="52" r="10" fill="none" stroke="rgb(255 217 160 / 0.5)" strokeWidth="1.5" />
      <circle cx="150" cy="52" r="3.5" fill="#ffd9a0" />
      {/* dashed camera frustum top-right (dashed = guides) */}
      <g stroke="rgb(143 123 255 / 0.7)" strokeWidth="1.5" strokeDasharray="5 4" fill="none">
        <rect x="396" y="30" width="34" height="22" rx="2" />
        <path d="M396 52 L318 88" />
        <path d="M430 52 L382 96" />
      </g>
      <CornerTicks />
    </>
  );
}
