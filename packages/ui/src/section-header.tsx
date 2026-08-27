import type { ReactNode } from "react";
import { cn } from "./utils";

type SectionHeaderProps = {
  /** Zero-padded section index, e.g. "03". Renders as a violet mono marker. */
  index?: string;
  /** Short uppercase kicker shown above the title. */
  kicker: string;
  title: ReactNode;
  /** Optional supporting sentence(s). */
  lead?: ReactNode;
  align?: "left" | "center";
  id?: string;
  className?: string;
};

/**
 * Editorial section header: mono index + kicker, large title, short lead.
 * Keeps the page rhythm consistent across every section.
 */
export function SectionHeader({
  index,
  kicker,
  title,
  lead,
  align = "left",
  id,
  className,
}: SectionHeaderProps) {
  const centered = align === "center";
  return (
    <div className={cn("max-w-2xl", centered && "mx-auto text-center", className)}>
      <p
        id={id}
        className={cn(
          "flex items-center gap-3 font-mono text-[11px] tracking-[0.3em] uppercase",
          centered && "justify-center",
        )}
      >
        {index ? <span className="text-violet">{index}</span> : null}
        <span aria-hidden="true" className="h-px w-8 bg-line" />
        <span className="text-fog">{kicker}</span>
      </p>
      <h2 className="mt-5 text-balance text-3xl leading-[1.12] font-semibold tracking-tight text-ink sm:text-4xl md:text-[2.7rem]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-pretty text-base leading-7 text-fog sm:text-lg sm:leading-8">
          {lead}
        </p>
      ) : null}
    </div>
  );
}
