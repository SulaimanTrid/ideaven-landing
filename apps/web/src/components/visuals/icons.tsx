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

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 10.5 12 4l7.5 6.5" />
      <path d="M6.5 9.3V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9.3" />
      <path d="M10 20v-5.5h4V20" />
    </Svg>
  );
}

export function IconTemplates(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 4.5h-9a2 2 0 0 0-2 2v9" />
    </Svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.4 5.8a3.2 3.2 0 0 1 0 5.4" />
      <path d="M17.6 14.8c1.8.8 2.9 2.4 2.9 4.7" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 7.5h14M5 12h14M5 16.5h14" />
      <circle cx="10" cy="7.5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16.5" r="1.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="5.5" width="15" height="13" rx="1.5" />
      <path d="M4.5 14.5 9 10l4 4 2.5-2.5 4 4" />
      <circle cx="9.2" cy="9.2" r="0.9" />
    </Svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v3h3" />
      <path d="M12 8.5V12l2.5 2.5" />
    </Svg>
  );
}

export function IconSignOut(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7.5" />
      <path d="M10 12h10.5" />
      <path d="M17 8.5l3.5 3.5-3.5 3.5" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8 20 20" />
    </Svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <Svg filled {...props}>
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
      <path d="M5.5 15H4.8A1.8 1.8 0 0 1 3 13.2V4.8A1.8 1.8 0 0 1 4.8 3h8.4A1.8 1.8 0 0 1 15 4.8v.7" />
    </Svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.2" />
      <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" />
      <path d="M10 12.5h4" />
    </Svg>
  );
}

export function IconRestore(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4" />
    </Svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}
