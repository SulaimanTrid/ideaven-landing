import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/auth/auth-provider";
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from "@/theme/theme-provider";
import { I18nProvider } from "@/lib/i18n/i18n";
import { SiteHeader } from "@/components/nav/site-header";
import { FooterGate } from "@/components/footer/footer-gate";
import { SiteFooter } from "@/components/footer/site-footer";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const siteDescription =
  "Create games and apps visually with blocks, or write real TypeScript code when you're ready. Every idea deserves a way to exist.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ideaven — Build it your way",
    template: "%s — Ideaven",
  },
  description: siteDescription,
  applicationName: "Ideaven",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Ideaven — Build it your way",
    description: siteDescription,
    type: "website",
    siteName: "Ideaven",
    url: "/",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Ideaven — blocks, code, and a live preview side by side. Build it your way.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ideaven — Build it your way",
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0c12",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the js-flag script below adds a class to
    // <html> before hydration on purpose, so that attribute is expected to
    // differ from the server render. Children still hydrate strictly.
    <html lang="en" className={sora.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">
        {/* Flags JS availability so CSS can pre-hide scroll reveals safely. */}
        <Script id="js-flag" strategy="beforeInteractive">
          {`document.documentElement.classList.add("js")`}
        </Script>
        {/* Applies the persisted theme before first paint — no flash. */}
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ThemeProvider>
          <I18nProvider>
          <AuthProvider>
            <SiteHeader />
            <main id="main">{children}</main>
            <FooterGate>
              <SiteFooter />
            </FooterGate>
          </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
