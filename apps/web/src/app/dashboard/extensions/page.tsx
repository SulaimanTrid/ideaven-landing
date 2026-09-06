"use client";
import { useI18n } from "@/lib/i18n/i18n";

import { ExtensionsClient } from "@/components/extensions/extensions-client";

export default function ExtensionsPage() {
  const { t } = useI18n();
  return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">{t("dash.extensions")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{t("ext.heading")}</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">{t("ext.tagline")}</p>
        <div className="mt-8">
          <ExtensionsClient />
        </div>
      </div>
  );
}
