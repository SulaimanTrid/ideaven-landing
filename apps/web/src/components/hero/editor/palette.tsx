import { cn } from "@ideaven/ui";

/**
 * The real Ideaven block palette (fidelity pass): the exact categories,
 * colors, and block labels the builder's Blocks mode exposes — same IR
 * vocabulary, same solid-fill visual language. Nothing invented here.
 */

const CATEGORIES: Category[] = [
  { name: "navigation", color: "#58c7f0", blocks: ["navigate to _"] },
  { name: "variables", color: "#ff7d9c", blocks: ["set variable _ to _"] },
  { name: "control", color: "#ffb454", blocks: ["if _"] },
  { name: "ui", color: "#8f7bff", blocks: ["set _._ to _", "show message _"] },
  { name: "text", color: "#46e3b4", blocks: ["\"_\"", "_ + _"] },
  { name: "logic", color: "#f2c94c", blocks: ["_ equals _"] },
];

type Category = {
  name: string;
  color: string;
  blocks: string[];
};

/** Left rail of the editor visual: the block palette by category. */
export function Palette({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Block palette"
      className={cn(
        "flex w-40 shrink-0 flex-col gap-2.5 overflow-hidden border-r border-line bg-panel/70 p-3",
        className,
      )}
    >
      <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
        Blocks
      </p>
      <ul className="flex flex-col gap-2">
        {CATEGORIES.map((category, index) => (
          <li key={category.name}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: category.color }}
              />
              <span className="text-[11.5px] font-medium text-fog">
                {category.name}
              </span>
            </div>
            {index < 2 ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {category.blocks.map((block) => (
                  <li
                    key={block}
                    className="rounded-[6px] px-1.5 py-[3px] text-[10px] font-medium text-[#0b0e16]"
                    style={{
                      background: category.color,
                      border: "1px solid rgb(10 12 18 / 0.3)",
                    }}
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
