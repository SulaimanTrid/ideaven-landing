"use client";

import type { ReactNode } from "react";
import { cn } from "@ideaven/ui";

/**
 * Device frames for the preview emulator (launch feedback): the screen is
 * wrapped in a bezel that reads as a real phone, tablet, or desktop monitor
 * — side buttons, camera dot, speaker slot, monitor stand — so what you
 * preview looks like the hardware it targets. Pure presentation.
 */

export type DeviceKind = "phone" | "tablet" | "desktop";

type DeviceFrameProps = {
  kind: DeviceKind;
  children: ReactNode;
  className?: string;
};

export function DeviceFrame({ kind, children, className }: DeviceFrameProps) {
  if (kind === "desktop") {
    return (
      <div className={cn("flex flex-col items-center", className)}>
        {/* monitor bezel */}
        <div className="relative rounded-[18px] border border-line bg-[#1a1f2e] p-[10px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]">
          {/* camera dot */}
          <span aria-hidden className="absolute left-1/2 top-[3px] h-[4px] w-[4px] -translate-x-1/2 rounded-full bg-[#2c3448]" />
          <div className="relative overflow-hidden rounded-[8px]">{children}</div>
          {/* brand lip */}
          <span aria-hidden className="absolute bottom-[3px] left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-[#2c3448]" />
        </div>
        {/* neck + stand */}
        <div aria-hidden className="h-8 w-16 bg-gradient-to-b from-[#232a3d] to-[#161c2b]" />
        <div aria-hidden className="h-[10px] w-56 rounded-[6px] bg-[#1a1f2e] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)]" />
      </div>
    );
  }

  if (kind === "tablet") {
    return (
      <div className={cn("relative rounded-[34px] border border-line bg-[#1a1f2e] p-[16px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]", className)}>
        {/* camera dot (landscape tablet) */}
        <span aria-hidden className="absolute left-[7px] top-1/2 h-[6px] w-[6px] -translate-y-1/2 rounded-full bg-[#2c3448]" />
        {/* side buttons */}
        <span aria-hidden className="absolute -right-[3px] top-24 h-14 w-[3px] rounded-r bg-[#2c3448]" />
        <span aria-hidden className="absolute -right-[3px] top-44 h-9 w-[3px] rounded-r bg-[#2c3448]" />
        <div className="relative overflow-hidden rounded-[14px]">{children}</div>
      </div>
    );
  }

  // phone
  return (
    <div className={cn("relative rounded-[40px] border border-line bg-[#1a1f2e] p-[12px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]", className)}>
      {/* side buttons: volume up/down + power */}
      <span aria-hidden className="absolute -left-[3px] top-[120px] h-10 w-[3px] rounded-l bg-[#2c3448]" />
      <span aria-hidden className="absolute -left-[3px] top-[170px] h-10 w-[3px] rounded-l bg-[#2c3448]" />
      <span aria-hidden className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r bg-[#2c3448]" />
      <div className="relative overflow-hidden rounded-[26px]">
        {children}
        {/* punch-hole camera + speaker slit overlay */}
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[10px] h-[18px] w-[74px] -translate-x-1/2 rounded-full bg-[#10141f]">
          <span className="absolute right-[10px] top-1/2 h-[8px] w-[8px] -translate-y-1/2 rounded-full bg-[#232c40]" />
        </span>
      </div>
      {/* home indicator */}
      <span aria-hidden className="pointer-events-none absolute bottom-[6px] left-1/2 h-[4px] w-24 -translate-x-1/2 rounded-full bg-white/25" />
    </div>
  );
}
