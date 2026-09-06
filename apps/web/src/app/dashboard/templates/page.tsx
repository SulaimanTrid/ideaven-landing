"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { TemplateGallery } from "@/components/dashboard/template-gallery";

export default function TemplatesPage() {
  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Templates</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Start from a real project</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
          Every template is a working Ideaven model — open it in the builder,
          change anything, and make it yours.
        </p>
        <div className="mt-8">
          <TemplateGallery />
        </div>
      </div>
    </DashboardShell>
  );
}
