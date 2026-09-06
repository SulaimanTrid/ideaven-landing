"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ExtensionsClient } from "@/components/extensions/extensions-client";

export default function ExtensionsPage() {
  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Extensions</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Your extensions</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
          Author components, methods, events, and blocks once — package them
          as .AIX and install them into any project.
        </p>
        <div className="mt-8">
          <ExtensionsClient />
        </div>
      </div>
    </DashboardShell>
  );
}
