import type { Metadata } from "next";

/**
 * TASK 65 §31: the gallery is a public surface — give it real metadata (the
 * page itself is a client component, so the metadata lives here).
 */
export const metadata: Metadata = {
  title: "Explore — Ideaven",
  description:
    "Real apps and games published with Ideaven. Open any card and the project actually runs — then remix it into your own account.",
  alternates: { canonical: "/explore" },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
