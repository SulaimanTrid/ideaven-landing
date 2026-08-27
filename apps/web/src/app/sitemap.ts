import type { MetadataRoute } from "next";

/**
 * sitemap.xml. Only real, indexable content is listed — future-phase
 * placeholder pages are `noindex` and intentionally excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return [
    {
      url: `${base}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
