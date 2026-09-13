import type { Metadata } from "next";
import { CommunityHome } from "@/components/community/community-home";

/**
 * Community (TASK 07): the creator ecosystem — questions, answers, showcase
 * discussions, and real published projects with deterministic previews.
 * Reads are public; every write requires a session and lands in the API.
 */

export const metadata: Metadata = {
  title: "Community — Ideaven",
  description:
    "Ask questions, share what you build, and help fellow creators. Real projects, real answers, real remixes.",
};

export const dynamic = "force-dynamic";

export default function CommunityPage() {
  return <CommunityHome />;
}
