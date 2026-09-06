"use client";

import { use } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ExtensionStudio } from "@/components/extensions/extension-studio";

export default function ExtensionStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">
          Extension Studio
        </p>
        <div className="mt-6">
          <ExtensionStudio id={id} />
        </div>
      </div>
    </DashboardShell>
  );
}
