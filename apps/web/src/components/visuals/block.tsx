import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@ideaven/ui";

/*
 * The Ideaven block: a rounded command block with a connect notch on top and
 * a matching bump below — the product's core visual motif.
 */

/** Depth of the notch/bump in px; blocks in a stack overlap by this amount. */
export const BLOCK_NOTCH_DEPTH = 4.5;

export function blockPath(w: number, h: number): string {
  const r = 8;
  const nx = 14; // notch left edge
  const nw = 18; // notch width
  const nd = BLOCK_NOTCH_DEPTH;
  const half = nw / 2;
  return [
    `M${r} 0`,
    `H${nx}`,
    `a${half} ${nd} 0 0 0 ${nw} 0`,
    `H${w - r}`,
    `A${r} ${r} 0 0 1 ${w} ${r}`,
    `V${h - r}`,
    `A${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H${nx + nw}`,
    `a${half} ${nd} 0 0 1 -${nw} 0`,
    `H${r}`,
    `A${r} ${r} 0 0 1 0 ${h - r}`,
    `V${r}`,
    `A${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
}

type BlockProps = {
  /** Fill color (CSS color or token var). */
  color: string;
  width: number;
  height?: number;
  /** Label color class; defaults to near-black for bright fills. */
  textClassName?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export function Block({
  color,
  width,
  height = 34,
  textClassName = "text-[#0b0e16]",
  className,
  style,
  children,
}: BlockProps) {
  const gradId = useId();
  const d = blockPath(width, height);
  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width, height, ...style }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        focusable="false"
      >
        <path d={d} fill={color} />
        <path d={d} fill={`url(#${gradId})`} />
        <path
          d={d}
          fill="none"
          stroke="rgb(10 12 18 / 0.35)"
          strokeWidth="1"
        />
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(255 255 255 / 0.22)" />
            <stop offset="0.55" stopColor="rgb(255 255 255 / 0)" />
          </linearGradient>
        </defs>
      </svg>
      <div
        className={cn(
          "relative z-10 flex h-full items-center gap-1.5 px-3 text-[12px] font-medium",
          textClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Inset value slot rendered inside a block, e.g. `when [Player]`. */
export function BlockInput({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[5px] bg-[rgb(10_12_18_/_0.28)] px-1.5 py-[1px] font-mono text-[11px] font-normal text-white/95">
      {children}
    </span>
  );
}
