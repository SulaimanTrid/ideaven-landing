/**
 * i18n dictionaries (master realignment §30): key-based translations for the
 * priority surfaces — site chrome, workspace navigation, dashboard home,
 * builder modes, extensions. English is the source of truth; Indonesian is
 * the first locale. Keys are grouped by surface (`nav.*`, `dash.*`,
 * `builder.*`, `ext.*`, `common.*`).
 */

export const dictionaries = {
  en: {
    "common.appName": "IDEAVEN",
    "common.theme": "Theme",
    "common.create": "Create",
    "common.loading": "Loading…",

    "nav.learn": "Learn",
    "nav.explore": "Explore",
    "nav.community": "Community",
    "nav.pricing": "Pricing",
    "nav.docs": "Docs",

    "dash.home": "Home",
    "dash.projects": "Projects",
    "dash.templates": "Templates",
    "dash.extensions": "Extensions",
    "dash.settings": "Settings",
    "dash.welcome": "Welcome back.",
    "dash.welcomeSub": "What will you build today?",
    "dash.createProject": "Create Project",
    "dash.recentProjects": "Recent Projects",
    "dash.viewAll": "View all projects",
    "dash.extensionsHeading": "Extensions",
    "dash.extensionsSub":
      "Author your own blocks, or install other creators' published extensions — installed blocks appear in every project's Blocks palette (the ⬡ section).",
    "dash.openExtensions": "Open extensions",
    "dash.yours": "Yours",
    "dash.authored": "authored extensions",
    "dash.installed": "Installed",
    "dash.inPalette": "in your builder palette",
    "dash.published": "Published for everyone",
    "dash.onShelf": "on the public shelf",

    "builder.design": "Design",
    "builder.blocks": "Blocks",
    "builder.code": "Code",
    "builder.preview": "Preview",
    "builder.insights": "Insights",
    "builder.publish": "Publish",
    "builder.export": "Export",
    "builder.assets": "Assets",
    "builder.history": "History",
    "builder.askAI": "Ask AI",
    "builder.save": "Save",
    "builder.saved": "Saved",
    "common.saving": "Saving…",
    "common.unsaved": "Unsaved changes",
    "common.saveFailed": "Save failed",
    "common.retrySave": "Retry save",

    "ext.heading": "Extensions",
    "ext.tagline":
      "Browse what every creator has published, install into your palette, and author your own — package them as .AIX and share with everyone.",
    "ext.explore": "Explore",
    "ext.installed": "Installed",
    "ext.yours": "Yours",
    "ext.new": "New extension",
    "ext.install": "Install",
    "ext.installing": "Installing…",
    "ext.inPalette": "In your palette",
    "ext.uninstall": "Uninstall",
    "ext.openStudio": "Open Studio",
  },
  id: {
    "common.appName": "IDEAVEN",
    "common.theme": "Tema",
    "common.create": "Buat",
    "common.loading": "Memuat…",

    "nav.learn": "Belajar",
    "nav.explore": "Jelajah",
    "nav.community": "Komunitas",
    "nav.pricing": "Harga",
    "nav.docs": "Dokumen",

    "dash.home": "Beranda",
    "dash.projects": "Proyek",
    "dash.templates": "Template",
    "dash.extensions": "Ekstensi",
    "dash.settings": "Pengaturan",
    "dash.welcome": "Selamat datang kembali.",
    "dash.welcomeSub": "Apa yang akan kamu buat hari ini?",
    "dash.createProject": "Buat Proyek",
    "dash.recentProjects": "Proyek Terbaru",
    "dash.viewAll": "Lihat semua proyek",
    "dash.extensionsHeading": "Ekstensi",
    "dash.extensionsSub":
      "Buat blokmu sendiri, atau pasang ekstensi karya kreator lain — blok terpasang muncul di palet Blocks setiap proyek (bagian ⬡).",
    "dash.openExtensions": "Buka ekstensi",
    "dash.yours": "Milikmu",
    "dash.authored": "ekstensi buatanmu",
    "dash.installed": "Terpasang",
    "dash.inPalette": "di palet buildermu",
    "dash.published": "Dipublikasikan untuk semua",
    "dash.onShelf": "di rak publik",

    "builder.design": "Desain",
    "builder.blocks": "Blok",
    "builder.code": "Kode",
    "builder.preview": "Pratinjau",
    "builder.insights": "Wawasan",
    "builder.publish": "Publikasikan",
    "builder.export": "Ekspor",
    "builder.assets": "Aset",
    "builder.history": "Riwayat",
    "builder.askAI": "Tanya AI",
    "builder.save": "Simpan",
    "builder.saved": "Tersimpan",
    "common.saving": "Menyimpan…",
    "common.unsaved": "Perubahan belum disimpan",
    "common.saveFailed": "Gagal menyimpan",
    "common.retrySave": "Coba simpan lagi",

    "ext.heading": "Ekstensi",
    "ext.tagline":
      "Jelajahi publikasi semua kreator, pasang ke paletmu, dan buat milikmu sendiri — kemas sebagai .AIX dan bagikan ke semua orang.",
    "ext.explore": "Jelajah",
    "ext.installed": "Terpasang",
    "ext.yours": "Milikmu",
    "ext.new": "Ekstensi baru",
    "ext.install": "Pasang",
    "ext.installing": "Memasang…",
    "ext.inPalette": "Di paletmu",
    "ext.uninstall": "Lepas",
    "ext.openStudio": "Buka Studio",
  },
} as const;

export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof (typeof dictionaries)["en"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  id: "Indonesia",
};

export const STORAGE_KEY = "ideaven-locale";

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "id") return stored;
  } catch {
    // storage unavailable — fall through to the browser language
  }
  const lang = (navigator.language ?? "en").toLowerCase();
  return lang.startsWith("id") ? "id" : "en";
}
