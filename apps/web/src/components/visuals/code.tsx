import { cn } from "@ideaven/ui";

/** [text, colorClass] pairs; whitespace is significant. */
export type CodeToken = readonly [string, string?];

/**
 * Static syntax-highlighted snippet. Whitespace is preserved inside a pre;
 * supply tokens in source order.
 */
export function HighlightedCode({
  tokens,
  className,
}: {
  tokens: readonly CodeToken[];
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto font-mono text-[12.5px] leading-6 text-fog",
        className,
      )}
    >
      <code className="whitespace-pre">
        {tokens.map(([text, cls], index) => (
          <span key={index} className={cls}>
            {text}
          </span>
        ))}
      </code>
    </pre>
  );
}
