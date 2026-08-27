import type { ReactNode, SVGProps } from "react";

/*
 * Hand-drawn 24px icon set for Ideaven. Stroke icons use currentColor so
 * they inherit text color; filled ones are marked below.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({
  size = 16,
  filled = false,
  children,
  ...props
}: IconProps & { filled?: boolean; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconRun(props: IconProps) {
  return (
    <Svg filled {...props}>
      <path d="M8.2 5.6v12.8a.7.7 0 0 0 1.06.6l10.3-6.4a.7.7 0 0 0 0-1.2L9.26 5a.7.7 0 0 0-1.06.6Z" />
    </Svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <Svg filled {...props}>
      <rect x="7" y="5.5" width="3.2" height="13" rx="1" />
      <rect x="13.8" y="5.5" width="3.2" height="13" rx="1" />
    </Svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <Svg filled {...props}>
      <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="1.6" />
    </Svg>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <Svg filled {...props}>
      <path d="M11 3.2l1.7 6.1 6.1 1.7-6.1 1.7L11 18.8l-1.7-6.1L3.2 11l6.1-1.7L11 3.2Z" />
      <circle cx="18.6" cy="4.8" r="1.4" />
    </Svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <Svg filled {...props}>
      <path d="M13.4 2.6 5.2 13.2h5.1L10.6 21.4 19 10.8h-5.2l-.4-8.2Z" />
    </Svg>
  );
}

export function IconBlocks(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3.5" width="8" height="7" rx="1.5" />
      <rect x="13" y="3.5" width="8" height="7" rx="1.5" />
      <rect x="8" y="13.5" width="8" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconCode(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.5 7 4.5 12l4 5M15.5 7l4 5-4 5" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12h15m-6-6.5L20 12l-6.5 6.5" />
    </Svg>
  );
}

export function IconArrowUpRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17 17 7M8.5 7H17v8.5" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

export function IconLoop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4" />
    </Svg>
  );
}

export function IconGamepad(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="7.5" width="19" height="9.5" rx="4.75" />
      <path d="M7.5 10.5v4M5.5 12.5h4" />
      <circle cx="15.6" cy="11.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18.3" cy="13.9" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconAppWindow(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9h17" />
      <circle cx="6.6" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.4" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconPen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 19.5l.9-3.6L16.4 4.9a2 2 0 0 1 2.8 2.8L8.1 18.6l-3.6.9Z" />
    </Svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 14.5v-11M7.8 7.2 12 3l4.2 4.2M5.5 21h13" />
    </Svg>
  );
}
