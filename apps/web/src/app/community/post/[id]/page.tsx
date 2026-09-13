import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { API_BASE_URL, type CommunityPost, type CommunityReply } from "@/lib/api";
import { PostDetail } from "@/components/community/post-detail";

export const dynamic = "force-dynamic";

/**
 * Server-side fetch of a public post, mirroring publicApi's raw pattern:
 * no session is attached, so what renders here is exactly what an anonymous
 * visitor sees; signed-in interactions happen client-side.
 */
async function load(id: string): Promise<{ post: CommunityPost; replies: CommunityReply[] } | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/community/posts/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`community post ${response.status}`);
  return (await response.json()) as { post: CommunityPost; replies: CommunityReply[] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id).catch(() => null);
  if (!data) return { title: "Post not found — Ideaven" };
  return { title: `${data.post.title} — Ideaven Community` };
}

export default async function CommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  return <PostDetail post={data.post} replies={data.replies} />;
}
