import { cn } from "./utils";

/**
 * Ideaven mark: a rounded block with a connect notch on top and a bump below
 * (the product's core motif) carrying a single "idea spark" dot.
 */
const MARK_PATH =
  "M7 0 H9 a5 4 0 0 0 10 0 H21 A7 7 0 0 1 28 7 V21 A7 7 0 0 1 21 28 H19 a5 4 0 0 1 -10 0 H7 A7 7 0 0 1 0 21 V7 A7 7 0 0 1 7 0 Z";

export function Logo({
  size = 28,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <path
          d={MARK_PATH}
          fill="var(--color-violet-deep, #6c58f5)"
        />
        <circle cx="17" cy="13.5" r="3.4" fill="var(--color-mint, #46e3b4)" />
      </svg>
      {withWordmark ? (
        <span className="text-[17px] font-semibold tracking-[0.09em] text-ink">
          IDEA<span className="font-normal text-fog">VEN</span>
        </span>
      ) : null}
    </span>
  );
}
