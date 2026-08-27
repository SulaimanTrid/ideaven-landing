import { cn } from "@ideaven/ui";

type Row = { label: string; value: React.ReactNode };

const ROWS: Row[] = [
  { label: "Name", value: <span className="text-ink">Player</span> },
  { label: "Position", value: "x 48 · y 100" },
  { label: "Size", value: "20 × 20" },
  { label: "Rotation", value: "0°" },
  {
    label: "Color",
    value: (
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-[3px] border border-white/20"
          style={{ backgroundColor: "var(--color-mint)" }}
        />
        <span className="text-mint">#46E3B4</span>
      </span>
    ),
  },
];

/** Right rail of the editor visual: properties of the selected object. */
export function Properties({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Properties panel (concept)"
      className={cn(
        "flex w-44 shrink-0 flex-col border-l border-line bg-panel/70 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
          Properties
        </p>
        <span className="rounded-full border border-mint/30 bg-mint/10 px-2 py-[2px] font-mono text-[10px] text-mint">
          player
        </span>
      </div>
      <dl className="mt-3 flex flex-col divide-y divide-line">
        {ROWS.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2 py-[7px]"
          >
            <dt className="text-[11px] text-mist">{row.label}</dt>
            <dd className="font-mono text-[11px] text-fog">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto hidden pt-6 font-mono text-[10px] leading-4 text-mist/70 xl:block">
        scene: main
        <br />
        gravity: 0.35
      </p>
    </aside>
  );
}
