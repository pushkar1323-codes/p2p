/**
 * Minimal inline SVG icon set for the P2P dashboard (L2-P07-UI).
 *
 * Hand-authored rather than pulled from an icon library, per project
 * scope ("prefer the project's existing dependencies" / "do not add
 * unnecessary dependencies" — no icon package is currently installed).
 * All icons are 20x20, stroke-based, `currentColor` so they inherit
 * color from context (nav item, button, badge, etc).
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.6" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.6" />
    </svg>
  );
}

export function LoanIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 3h9l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13 3v3h3" />
      <path d="M6.5 10h7M6.5 13h4.5" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5" width="15" height="11" rx="2" />
      <path d="M2.5 8.5h15" />
      <circle cx="14" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.6" />
      <path d="M4.5 12.5H3.6A1.6 1.6 0 0 1 2 10.9V3.6A1.6 1.6 0 0 1 3.6 2h7.3a1.6 1.6 0 0 1 1.6 1.6v.9" />
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8.5 3h7.5v7.5" />
      <path d="M16 3 8 11" />
      <path d="M13.5 12v3.9a1.1 1.1 0 0 1-1.1 1.1H4.1A1.1 1.1 0 0 1 3 15.9V7.6a1.1 1.1 0 0 1 1.1-1.1H8" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M16 4v4.5h-4.5" />
      <path d="M4 16v-4.5h4.5" />
      <path d="M15 8a5.6 5.6 0 0 0-9.6-3.1L4 6.5" />
      <path d="M5 12a5.6 5.6 0 0 0 9.6 3.1L16 13.5" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M17 3 2.5 9.2 9 11l1.8 6.5L17 3Z" />
      <path d="M9 11l4.5-4.5" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function CancelActionIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M16.5 16.5 13 13" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7.3" />
      <path d="M7 10.2l2.1 2.1 4-4.2" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3 2.5 16.5h15L10 3Z" />
      <path d="M10 8.3v3.3" />
      <circle cx="10" cy="14.3" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="10" cy="15" r="2" />
      <path d="M6.7 7.2 8.6 13M13.3 7.2 11.4 13M7 6h6" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a6.8 6.8 0 1 0 8.8 8.8Z" />
    </svg>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.6" />
      <path d="M7 17h6M10 13.5V17" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="4" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h6" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="7" r="3.3" />
      <path d="M3.8 17c0.7-3.4 3.4-5.4 6.2-5.4s5.5 2 6.2 5.4" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M16 10H4M4 10l5-5M4 10l5 5" />
    </svg>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 10.5h3.2l1.8-5.5 3 11 1.8-5.5h3.2" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10.5" r="7" />
      <path d="M10 6.5v4l3 2" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3.2v2M10 14.8v2M16.8 10h-2M5.2 10h-2M14.9 5.1l-1.4 1.4M6.5 13.5l-1.4 1.4M14.9 14.9l-1.4-1.4M6.5 6.5 5.1 5.1" />
    </svg>
  );
}

/** The P2P brand mark: two linked nodes, echoing "peer to peer". */
export function P2PMark(props: IconProps) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      {...props}
    >
      <circle cx="6" cy="16" r="3" />
      <circle cx="16" cy="6" r="3" />
      <path d="M8.2 13.8 13.8 8.2" />
    </svg>
  );
}
