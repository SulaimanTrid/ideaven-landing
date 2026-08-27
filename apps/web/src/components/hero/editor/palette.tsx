import { cn } from "@ideaven/ui";

type Category = {
  name: string;
  color: string;
  blocks: string[];
};

const CATEGORIES: Category[] = [
  { name: "Events", color: "var(--color-amber)", blocks: ["when ⏵ clicked", "when key pressed"] },
  { name: "Motion", color: "var(--color-sky)", blocks: ["move steps", "glide to x y"] },
  { name: "Logic", color: "var(--color-mint)", blocks: ["if / then", "repeat"] },
  { name: "Looks", color: "var(--color-rose)", blocks: ["say", "set effect"] },
  { name: "Data", color: "var(--color-violet)", blocks: ["change by", "set"] },
  { name: "Components", color: "#9aa3b8", blocks: ["Button", "Timer"] },
];

/** Left rail of the editor visual: the block palette by category. */
export function Palette({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Block palette (concept)"
      className={cn(
        "flex w-40 shrink-0 flex-col gap-3 overflow-hidden border-r border-line bg-panel/70 p-3",
        className,
      )}
    >
      <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
        Palette
      </p>
      <ul className="flex flex-col gap-2.5">
        {CATEGORIES.map((category, index) => (
          <li key={category.name}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: category.color }}
              />
              <span className="text-[12px] font-medium text-fog">
                {category.name}
              </span>
            </div>
            {index === 0 ? (
              <ul className="mt-1.5 flex flex-col gap-1 pl-1">
                {category.blocks.map((block) => (
                  <li
                    key={block}
                    className="rounded-[5px] px-1.5 py-[3px] font-mono text-[10px] text-amber/90"
                    style={{ backgroundColor: "rgb(255 180 84 / 0.09)" }}
                  >
                    {block}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="mt-auto h-8 bg-gradient-to-t from-panel to-transparent"
      />
    </aside>
  );
}
