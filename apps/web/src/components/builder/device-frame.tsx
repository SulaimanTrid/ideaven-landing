"use client";

import type { ReactNode } from "react";
import { cn } from "@ideaven/ui";

/**
 * Device frames for the preview emulator (launch feedback): the screen is
 * wrapped in a bezel that reads as a real phone, tablet, or desktop monitor
 * — side buttons, camera dot, speaker slot, monitor stand — so what you
 * preview looks like the hardware it targets. Pure presentation.
 *
 * TASK 61 §10–14: the frame is ORIENTATION-AWARE. Landscape repositions the
 * physical chrome (buttons on the short edges, camera/speaker pill rotated
 * onto the left edge, home indicator vertical on the right) so the ENTIRE
 * device presentation reflows as one coherent object — the screen already
 * swaps its canonical dimensions through the ONE viewport-size helper, and
 * the measured-unit scale in the canvas wraps this whole frame, so there is
 * exactly one scale owner and no sideways leftover portrait composition.
 */

export type DeviceKind = "phone" | "tablet" | "desktop";
export type DeviceOrientation = "portrait" | "landscape";

type DeviceFrameProps = {
  kind: DeviceKind;
  children: ReactNode;
  className?: string;
  /** Presentation-only; the screen dimensions swap through viewportSize(). */
  orientation?: DeviceOrientation;
};

export function DeviceFrame({ kind, children, className, orientation = "portrait" }: DeviceFrameProps) {
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
    const landscape = orientation === "landscape";
    return (
      <div className={cn("relative rounded-[34px] border border-line bg-[#1a1f2e] p-[16px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]", className)}>
        {/* camera: top-center in portrait, left-center in landscape */}
        <span
          aria-hidden
          className={cn(
            "absolute h-[6px] w-[6px] rounded-full bg-[#2c3448]",
            landscape ? "left-[7px] top-1/2 -translate-y-1/2" : "left-1/2 top-[7px] -translate-x-1/2",
          )}
        />
        {/* side buttons stay on the right edge in both orientations */}
        <span aria-hidden className="absolute -right-[3px] top-24 h-14 w-[3px] rounded-r bg-[#2c3448]" />
        <span aria-hidden className="absolute -right-[3px] top-44 h-9 w-[3px] rounded-r bg-[#2c3448]" />
        <div className="relative overflow-hidden rounded-[14px]">{children}</div>
      </div>
    );
  }

  // phone
  const landscape = orientation === "landscape";
  return (
    <div className={cn("relative rounded-[40px] border border-line bg-[#1a1f2e] p-[12px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]", className)}>
      {landscape ? (
        <>
          {/* rotated: volume on the top edge, power on the bottom edge */}
          <span aria-hidden className="absolute -top-[3px] left-[140px] h-[3px] w-10 rounded-t bg-[#2c3448]" />
          <span aria-hidden className="absolute -top-[3px] left-[190px] h-[3px] w-10 rounded-t bg-[#2c3448]" />
          <span aria-hidden className="absolute -bottom-[3px] right-[150px] h-[3px] w-16 rounded-b bg-[#2c3448]" />
        </>
      ) : (
        <>
          {/* portrait: volume left, power right */}
          <span aria-hidden className="absolute -left-[3px] top-[120px] h-10 w-[3px] rounded-l bg-[#2c3448]" />
          <span aria-hidden className="absolute -left-[3px] top-[170px] h-10 w-[3px] rounded-l bg-[#2c3448]" />
          <span aria-hidden className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r bg-[#2c3448]" />
        </>
      )}
      <div className="relative overflow-hidden rounded-[26px]">
        {children}
        {/* punch-hole camera + speaker slit: top-center in portrait, rotated
            onto the left edge in landscape (where the real camera lands) */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full bg-[#10141f]",
            landscape
              ? "left-[10px] top-1/2 h-[74px] w-[18px] -translate-y-1/2"
              : "left-1/2 top-[10px] h-[18px] w-[74px] -translate-x-1/2",
          )}
        >
          <span
            className={cn(
              "absolute h-[8px] w-[8px] -translate-y-1/2 rounded-full bg-[#232c40]",
              landscape ? "bottom-[10px] left-1/2 -translate-x-1/2" : "right-[10px] top-1/2",
            )}
          />
        </span>
      </div>
      {/* home indicator: bottom-center in portrait, right-edge-center in landscape */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute rounded-full bg-white/25",
          landscape ? "right-[6px] top-1/2 h-24 w-[4px] -translate-y-1/2" : "bottom-[6px] left-1/2 h-[4px] w-24 -translate-x-1/2",
        )}
      />
    </div>
  );
}
