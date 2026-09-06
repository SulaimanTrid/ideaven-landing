import { cn } from "@ideaven/ui";

/**
 * The real Ideaven screen inspector (fidelity pass): the exact sections and
 * rows the builder's Inspector shows for a screen — Name, ID, Components,
 * Appearance/Background — over the dark scene stage of the demo project.
 */

const ROWS: Row[] = [
  { label: "Name", value: <span className="text-ink">Home</span> },
  { label: "ID", value: <span className="font-mono text-[11.5px] text-fog">screen-home</span> },
  { label: "Components", value: "5" },
];

type Row = { label: string; value: React.ReactNode };

/** Right rail of the editor visual: the screen inspector. */
export function Properties({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Screen inspector"
      className={cn(
        "flex w-44 shrink-0 flex-col gap-3 border-l border-line bg-panel/70 p-3",
        className,
      )}
    >
      <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
        Inspector
      </p>
      <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
        Screen
      </p>
      <dl className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <dt className="text-[11.5px] text-mist">{row.label}</dt>
            <dd className="min-w-0 truncate text-[11.5px] text-fog">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
        Appearance
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-mist">Background</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-[3px] border border-white/20"
            style={{ backgroundColor: "#0c0f17" }}
          />
          <span className="font-mono text-[11px] text-fog">#0c0f17</span>
        </span>
      </div>
      <p className="mt-auto text-[11px] leading-4 text-mist">
        Select a component on the canvas or in the tree to edit its properties.
      </p>
    </aside>
  );
}
