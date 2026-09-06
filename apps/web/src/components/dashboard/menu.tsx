"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@ideaven/ui";
import { IconMore } from "@/components/visuals/icons";

/**
 * Small dropdown menu ("⋯" actions) for cards and rows. Closes on selection,
 * outside pointer-down, and Escape; focus returns to the trigger so keyboard
 * users never lose their place.
 */
export function DropdownMenu({
  label,
  items,
  triggerClassName,
}: {
  label: string;
  /** A null item renders a visual separator. */
  items: ({ key: string; label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void; disabled?: boolean } | null)[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-60",
          triggerClassName,
        )}
      >
        <IconMore size={16} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-xl"
        >
          {items.map((item, index) =>
            item === null ? (
              <div key={`separator-${index}`} aria-hidden="true" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint disabled:opacity-50",
                  item.danger
                    ? "text-rose hover:bg-rose/10"
                    : "text-fog hover:bg-surface hover:text-ink",
                )}
              >
                {item.icon ? <span aria-hidden="true" className="shrink-0">{item.icon}</span> : null}
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
