import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

/**
 * @ideaven/ui primitives rely on the Ideaven design tokens (colors such as
 * `violet-deep`, `fog`, `line`, `mint`) defined in the consuming app's
 * Tailwind theme. See apps/web/src/app/globals.css.
 */

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:pointer-events-none disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary:
    "bg-violet-deep text-white shadow-[0_10px_30px_-10px] shadow-violet/50 hover:bg-violet active:bg-violet-strong",
  secondary:
    "border border-line bg-white/[0.03] text-ink hover:border-white/20 hover:bg-white/[0.07]",
  ghost: "text-fog hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <a className={cn(base, variants[variant], sizes[size], className)} {...props} />
  );
}
