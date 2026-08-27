import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type Tone = "default" | "violet" | "mint" | "amber" | "rose" | "sky";

const tones: Record<Tone, string> = {
  default: "border-line bg-white/[0.02] text-fog",
  violet: "border-violet/30 bg-violet/10 text-violet",
  mint: "border-mint/30 bg-mint/10 text-mint",
  amber: "border-amber/30 bg-amber/10 text-amber",
  rose: "border-rose/30 bg-rose/10 text-rose",
  sky: "border-sky/30 bg-sky/10 text-sky",
};

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  children: ReactNode;
};

/** Small uppercase mono label used for tags, section markers, and statuses. */
export function Chip({ tone = "default", className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-mono text-[11px] leading-none tracking-[0.14em] uppercase",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
