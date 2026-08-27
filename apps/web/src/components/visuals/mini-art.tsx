/*
 * Compact thumbnail art for showcase cards. Six variants, all pure SVG —
 * no raster assets anywhere in the project.
 */

type MiniArtProps = { variant: string; className?: string };

function PlatformerArt() {
  return (
    <svg viewBox="0 0 200 125" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="125" fill="#0c0f17" />
      <rect x="0" y="104" width="200" height="21" fill="#151b29" />
      <rect x="18" y="62" width="58" height="7" rx="2.5" fill="#1b2130" />
      <rect x="18" y="62" width="58" height="2" rx="1" fill="#2a3348" />
      <rect x="112" y="40" width="52" height="7" rx="2.5" fill="#1b2130" />
      <rect x="112" y="40" width="52" height="2" rx="1" fill="#2a3348" />
      <rect x="76" y="44" width="16" height="16" rx="4" fill="var(--color-mint)" transform="rotate(-6 84 52)" />
      <circle cx="130" cy="30" r="4.5" fill="var(--color-amber)" />
      <circle cx="142" cy="30" r="4.5" fill="var(--color-amber)" opacity="0.35" />
      <rect x="172" y="46" width="2" height="24" fill="#3a4358" />
      <polygon points="174,47 188,51 174,55" fill="var(--color-rose)" />
    </svg>
  );
}

function OrbitArt() {
  return (
    <svg viewBox="0 0 200 125" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="125" fill="#0c0f17" />
      <g stroke="#232b3f" fill="none">
        <circle cx="100" cy="62" r="20" />
        <circle cx="100" cy="62" r="34" />
        <circle cx="100" cy="62" r="48" strokeDasharray="3 4" />
      </g>
      <circle cx="100" cy="62" r="5" fill="var(--color-violet)" />
      <circle cx="100" cy="42" r="4.5" fill="var(--color-amber)" />
      <circle cx="126" cy="80" r="4.5" fill="var(--color-sky)" />
      <circle cx="58" cy="42" r="4.5" fill="var(--color-mint)" />
      <circle cx="146" cy="34" r="3" fill="#3a4358" />
      <circle cx="64" cy="96" r="3" fill="#3a4358" />
    </svg>
  );
}

function ArcadeArt() {
  return (
    <svg viewBox="0 0 200 125" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="125" fill="#0c0f17" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect
          key={index}
          x={22 + index * 27}
          y={22}
          width={22}
          height={9}
          rx={2.5}
          fill={index % 2 === 0 ? "var(--color-violet)" : "var(--color-rose)"}
          opacity={index === 4 ? 0.35 : 1}
        />
      ))}
      <rect x="84" y="98" width="34" height={7} rx="3.5" fill="var(--color-sky)" />
      <circle cx="100" cy="80" r="4.5" fill="var(--color-mint)" />
      <circle cx="108" cy="88" r="2.2" fill="var(--color-mint)" opacity="0.5" />
      <circle cx="114" cy="94" r="1.4" fill="var(--color-mint)" opacity="0.3" />
      <rect x="0" y="112" width="200" height="13" fill="#151b29" />
    </svg>
  );
}

function DashboardArt() {
  const bars = [
    { x: 26, h: 26, fill: "#3a4358" },
    { x: 48, h: 40, fill: "var(--color-sky)" },
    { x: 70, h: 34, fill: "#3a4358" },
    { x: 92, h: 56, fill: "var(--color-violet)" },
    { x: 114, h: 46, fill: "#3a4358" },
    { x: 136, h: 66, fill: "var(--color-amber)" },
    { x: 158, h: 58, fill: "var(--color-mint)" },
  ];
  return (
    <svg viewBox="0 0 200 125" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="125" fill="#0c0f17" />
      <rect x="14" y="12" width="42" height="6" rx="3" fill="#2a3348" />
      <rect x="14" y="24" width="26" height="5" rx="2.5" fill="#202839" />
      <rect x="170" y="12" width="18" height="6" rx="3" fill="var(--color-mint)" opacity="0.6" />
      {bars.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={92 - bar.h}
          width="14"
          height={bar.h}
          rx="3"
          fill={bar.fill}
        />
      ))}
      <polyline
        points="26,70 48,58 70,62 92,44 114,52 136,32 158,38"
        fill="none"
        stroke="var(--color-mint)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <rect x="0" y="92" width="200" height="2" fill="#232c40" />
    </svg>
  );
}

function QuizArt() {
  return (
    <svg viewBox="0 0 200 125" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="125" fill="#0c0f17" />
      <rect x="24" y="16" width="152" height="94" rx="8" fill="#10141f" stroke="#232b3f" />
      <rect x="38" y="30" width="88" height="7" rx="3.5" fill="#3a4358" />
      <rect x="38" y="50" width="124" height="10" rx="4" fill="#1b2130" />
      <rect x="38" y="66" width="124" height="10" rx="4" fill="#1b2130" stroke="var(--color-mint)" strokeOpacity="0.7" />
      <circle cx="154" cy="71" r="2.5" fill="var(--color-mint)" />
      <rect x="38" y="82" width="124" height="10" rx="4" fill="#1b2130" />
      <rect x="38" y="100" width="44" height="6" rx="3" fill="#2a3348" />
      <rect x="122" y="98" width="40" height="9" rx="4.5" fill="var(--color-violet)" />
    </svg>
  );
}

function SynthArt() {
  const pads = [
    { lit: false }, { lit: false }, { lit: false }, { lit: true },
    { lit: false }, { lit: "dim" }, { lit: false }, { lit: false },
    { lit: false }, { lit: false }, { lit: "dim" }, { lit: false },
  ];
  return (
    <svg viewBox="0 0 200 125" className="h-full w-full" aria-hidden="true">
      <rect width="200" height="125" fill="#0c0f17" />
      {pads.map((pad, index) => {
        const col = index % 4;
        const row = Math.floor(index / 4);
        const x = 38 + col * 32;
        const y = 14 + row * 32;
        return (
          <g key={index}>
            {pad.lit === true ? (
              <rect x={x - 3} y={y - 3} width="30" height="30" rx="7" fill="var(--color-violet)" opacity="0.25" />
            ) : null}
            <rect
              x={x}
              y={y}
              width="24"
              height="24"
              rx="6"
              fill={
                pad.lit === true
                  ? "var(--color-violet)"
                  : pad.lit === "dim"
                    ? "#252d44"
                    : "#1b2130"
              }
            />
          </g>
        );
      })}
      <rect x="38" y="112" width="120" height="4" rx="2" fill="#2a3348" />
      <rect x="38" y="112" width="72" height="4" rx="2" fill="var(--color-mint)" opacity="0.7" />
    </svg>
  );
}

const VARIANTS: Record<string, () => React.ReactElement> = {
  platformer: PlatformerArt,
  orbit: OrbitArt,
  arcade: ArcadeArt,
  dashboard: DashboardArt,
  quiz: QuizArt,
  synth: SynthArt,
};

export function MiniArt({ variant, className }: MiniArtProps) {
  const Art = VARIANTS[variant] ?? PlatformerArt;
  return (
    <div className={className ?? "h-full w-full"}>
      <Art />
    </div>
  );
}
