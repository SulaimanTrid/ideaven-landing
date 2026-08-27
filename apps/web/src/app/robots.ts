import type { MetadataRoute } from "next";

/**
 * robots.txt. Placeholder routes are individually `noindex` via page metadata;
 * everything else is crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
