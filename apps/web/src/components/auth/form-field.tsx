"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@ideaven/ui";
import { IconEye } from "@/components/visuals/icons";

const inputBase =
  "h-11 w-full rounded-lg border bg-panel px-3.5 text-[15px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint";

/**
 * Accessible label + control + message trio used by every auth form.
 * The message is wired via aria-describedby and aria-invalid so screen
 * readers announce validation results.
 */
export function FormField({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  htmlFor?: string;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const controlHtmlFor = htmlFor ?? id;
  const describedBy = error || hint ? messageId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlHtmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={messageId} role="alert" className="text-[13px] leading-5 text-rose">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[13px] leading-5 text-mist">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Wired to aria-describedby — pairs with FormField's message. */
  describedBy?: string;
};

function inputProps({ describedBy, invalid, ...rest }: InputProps) {
  return {
    ...rest,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": invalid || undefined,
  };
}

/** Text input styled to the Ideaven design tokens. */
export function TextInput(props: InputProps) {
  return (
    <input
      {...inputProps(props)}
      className={cn(inputBase, props.invalid ? "border-rose/60" : "border-line", props.className)}
    />
  );
}

/** Password input with a keyboard-reachable show/hide toggle. */
export function PasswordInput(props: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...inputProps(props)}
        type={visible ? "text" : "password"}
        className={cn(inputBase, "pr-12", props.invalid ? "border-rose/60" : "border-line", props.className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center rounded-r-lg text-mist transition-colors hover:text-fog focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconEye size={17} className={visible ? "text-mint" : undefined} />
      </button>
    </div>
  );
}
