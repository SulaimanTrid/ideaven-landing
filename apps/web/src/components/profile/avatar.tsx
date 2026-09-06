import { cn } from "@ideaven/ui";

/**
 * User avatar: the profile image when one is set, otherwise the initial on
 * the violet-deep token — the same treatment the dashboard uses.
 */
export function Avatar({
  displayName,
  avatarUrl,
  size = "md",
  className,
}: {
  displayName: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "h-9 w-9 text-sm", md: "h-12 w-12 text-lg", lg: "h-20 w-20 text-3xl" }[size];

  if (avatarUrl) {
    return (
      // Remote images keep the layout stable while loading.
      <img
        src={avatarUrl}
        alt={`${displayName}'s avatar`}
        loading="lazy"
        className={cn("shrink-0 rounded-xl border border-line object-cover", dims, className)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-violet-deep font-semibold text-white",
        dims,
        className,
      )}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}
