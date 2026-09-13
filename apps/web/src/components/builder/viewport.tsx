"use client";

import type { ReactNode } from "react";
import { cn } from "@ideaven/ui";
import { DeviceFrame } from "@/components/builder/device-frame";

/**
 * The universal device/viewport system (TASK 11): ONE module that frames
 * every creation surface.
 *
 *   DEVICE FRAME for APPLICATIONS  — polished hardware (phone/tablet/desktop)
 *   VIEWPORT FRAME for GAMES       — a clean dark viewport shell; when the
 *                                    target device is phone/tablet the shell
 *                                    sits inside the same hardware frame, so
 *                                    a mobile game reads as a phone running
 *                                    the game without hiding the world.
 *
 * Everything (Preview mode, the design canvas, the published page) renders
 * through here — there is no second device-shell implementation.
 */

export type ViewportDevice = "phone" | "tablet" | "desktop" | "custom";
export type ViewportOrientation = "portrait" | "landscape";

export const VIEWPORT_SIZES: Record<"phone" | "tablet" | "desktop", { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1280, height: 800 },
};

export interface ViewportSettings {
  device: ViewportDevice;
  orientation: ViewportOrientation;
  safeArea?: boolean;
  /** Custom viewport pixel size (device === "custom"). */
  width?: number;
  height?: number;
}

/** Resolves the screen pixel size for a settings combination. */
export function viewportSize(settings: ViewportSettings): { width: number; height: number } {
  if (settings.device === "custom") {
    const width = Math.max(200, Math.min(2000, settings.width ?? 1024));
    const height = Math.max(200, Math.min(2000, settings.height ?? 640));
    return { width, height };
  }
  const base = VIEWPORT_SIZES[settings.device];
  return settings.orientation === "landscape" && settings.device !== "desktop"
    ? { width: base.height, height: base.width }
    : { ...base };
}

/** The app safe area for a device in its current orientation (px). */
export function safeAreaInset(device: ViewportDevice, orientation: ViewportOrientation): { top: number; bottom: number } {
  if (device === "desktop") return { top: 0, bottom: 0 };
  if (device === "tablet") return orientation === "portrait" ? { top: 24, bottom: 20 } : { top: 20, bottom: 24 };
  return orientation === "portrait" ? { top: 47, bottom: 34 } : { top: 34, bottom: 21 };
}

export interface ViewportFrameProps {
  /** "app" renders the hardware device frame; "game" renders the viewport shell. */
  kind: "app" | "game";
  settings: ViewportSettings;
  /** Overlay chrome drawn over the screen (e.g. safe-area bands). */
  children: ReactNode;
  className?: string;
  screenClassName?: string;
}

export function ViewportFrame({ kind, settings, children, className, screenClassName }: ViewportFrameProps) {
  const { width, height } = viewportSize(settings);
  const hardware = settings.device === "phone" || settings.device === "tablet";

  const screen = (
    <div
      className={cn("relative overflow-hidden", screenClassName)}
      style={{ width, height }}
    >
      {children}
      {kind === "app" && settings.safeArea ? <SafeAreaOverlay settings={settings} /> : null}
    </div>
  );

  if (kind === "game") {
    // Game viewport shell: dark, quiet, centered — the world stays the hero.
    // On phone/tablet targets the shell rides inside the same hardware frame
    // the apps use, so a mobile game reads as a phone running the game.
    const shell = (
      <div className={cn("relative", className)}>
        <div className="relative overflow-hidden rounded-[18px] border border-violet/30 bg-[#0c0f17] shadow-[0_24px_80px_-30px_rgb(0_0_0/0.9)]">
          {/* corner ticks: subtle viewport instrumentation, no fake hardware */}
          <span aria-hidden className="pointer-events-none absolute left-2 top-2 h-3 w-3 rounded-tl border-l border-t border-violet/40" />
          <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-3 w-3 rounded-tr border-r border-t border-violet/40" />
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 rounded-bl border-b border-l border-violet/40" />
          <span aria-hidden className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 rounded-br border-b border-r border-violet/40" />
          {screen}
        </div>
      </div>
    );
    if (hardware) {
      return <DeviceFrame kind={settings.device === "tablet" ? "tablet" : "phone"}>{shell}</DeviceFrame>;
    }
    return shell;
  }

  // App: the polished hardware frame.
  return (
    <div className={className}>
      <DeviceFrame kind={settings.device === "tablet" ? "tablet" : settings.device === "desktop" ? "desktop" : "phone"}>
        {screen}
      </DeviceFrame>
    </div>
  );
}

/** Diagonal-hatched bands marking notch/status and gesture areas. */
function SafeAreaOverlay({ settings }: { settings: ViewportSettings }) {
  const { top, bottom } = safeAreaInset(settings.device, settings.orientation);
  if (top === 0 && bottom === 0) return null;
  const band = "pointer-events-none absolute inset-x-0 z-20 bg-[repeating-linear-gradient(45deg,rgb(143_123_255/0.14)_0_6px,transparent_6px_12px)]";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <div className={band} style={{ top: 0, height: top }}>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-violet/25 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/90">
          safe area {top}px
        </span>
      </div>
      <div className={band} style={{ bottom: 0, height: bottom }}>
        <span className="absolute left-1/2 top-0.5 -translate-x-1/2 rounded-full bg-violet/25 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/90">
          safe area {bottom}px
        </span>
      </div>
    </div>
  );
}
