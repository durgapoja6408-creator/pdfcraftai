// Icons.tsx — ported verbatim from the prototype's icons.jsx so the
// design stays pixel-identical. 24px viewBox, 1.5 stroke by default.
//
// Usage:  <I.Merge size={18} />
//         <I.Sparkle size={12} className="text-accent" />

import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "stroke" | "width" | "height" | "viewBox"> & {
  size?: number;
  stroke?: number;
};

const IconBase = ({
  size = 18,
  stroke = 1.5,
  fill = "none",
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

export const I = {
  Logo: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </IconBase>
  ),
  Merge: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="3" y="4" width="7" height="10" rx="1" />
      <rect x="14" y="10" width="7" height="10" rx="1" />
      <path d="M10 9l4 2" />
    </IconBase>
  ),
  Split: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="8" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="14" width="8" height="7" rx="1" />
      <rect x="13" y="14" width="8" height="7" rx="1" />
    </IconBase>
  ),
  Compress: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </IconBase>
  ),
  Convert: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M7 7h10M17 7l-3-3M17 7l-3 3M17 17H7M7 17l3-3M7 17l3 3" />
    </IconBase>
  ),
  Image: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-8 8" />
    </IconBase>
  ),
  Pages: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </IconBase>
  ),
  Lock: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </IconBase>
  ),
  Unlock: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0" />
    </IconBase>
  ),
  Rotate: (p: IconProps) => (
    // 2026-04-27 (Wave 9 fix v2): the v1 fix kept the original 5×5
    // triangle which still rendered too small to read at the 18-28 px
    // sizes the icon is used at — users still saw a "C" arc with a
    // stray notch, same complaint as before.
    //
    // v2: redesigned around a 9×9 filled triangle in the upper-right.
    // The arc ends at (18, 5) which falls INSIDE the triangle, so the
    // arc visually nests into the tip — reading as one continuous
    // "rotating arrow ending in an arrowhead" rather than two
    // disconnected pieces. Triangle is large enough (~14% of the
    // viewBox area) to remain clearly visible at any practical size.
    //
    // Geometry:
    //   - Arc:       (3,12) → 270° CW → (18, 5)
    //   - Triangle:  (22,2)-(22,11)-(13,11), right angle at (22,11),
    //                hypotenuse from (22,2) to (13,11) is the visible
    //                "arrowhead front" facing the arc direction.
    <IconBase {...p}>
      <path d="M3 12a9 9 0 1 0 15 -7" />
      <polygon points="22 2 22 11 13 11" fill="currentColor" stroke="none" />
    </IconBase>
  ),
  Sparkle: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  ),
  Chat: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 5h16v11H8l-4 4V5z" />
      <circle cx="9" cy="10" r=".5" fill="currentColor" />
      <circle cx="12" cy="10" r=".5" fill="currentColor" />
      <circle cx="15" cy="10" r=".5" fill="currentColor" />
    </IconBase>
  ),
  Summary: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 6h16M4 10h10M4 14h16M4 18h8" />
    </IconBase>
  ),
  Translate: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M3 5h8M7 3v2M5 9s0 4 5 4M3 12s4 0 6-3M13 20l4-10 4 10M14 17h6" />
    </IconBase>
  ),
  Scan: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M4 12h16" />
    </IconBase>
  ),
  Edit: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />
    </IconBase>
  ),
  Shield: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" />
    </IconBase>
  ),
  Pen: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 20h4l10-10-4-4L4 16v4zM3 20h18" />
    </IconBase>
  ),
  Generate: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M12 11v6M9 14h6" />
    </IconBase>
  ),
  Upload: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </IconBase>
  ),
  Download: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
    </IconBase>
  ),
  Check: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M5 12l4 4 10-10" />
    </IconBase>
  ),
  X: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </IconBase>
  ),
  Plus: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  ),
  Minus: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M5 12h14" />
    </IconBase>
  ),
  ArrowRight: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </IconBase>
  ),
  ArrowLeft: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </IconBase>
  ),
  ChevronDown: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M6 9l6 6 6-6" />
    </IconBase>
  ),
  ChevronRight: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M9 6l6 6-6 6" />
    </IconBase>
  ),
  Search: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </IconBase>
  ),
  Settings: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </IconBase>
  ),
  User: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </IconBase>
  ),
  Key: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="7" cy="15" r="4" />
      <path d="M10 13l10-10M17 6l3 3M13 10l3 3" />
    </IconBase>
  ),
  Credit: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </IconBase>
  ),
  Coin: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h4a2 2 0 010 4H9M9 15h5" />
    </IconBase>
  ),
  Sun: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </IconBase>
  ),
  Moon: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M20 14.5A8 8 0 119.5 4a6 6 0 0010.5 10.5z" />
    </IconBase>
  ),
  File: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" />
      <path d="M14 3v6h6" />
    </IconBase>
  ),
  FileAi: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" />
      <path d="M14 3v6h6" />
      <path d="M9 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" />
    </IconBase>
  ),
  Trash: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" />
    </IconBase>
  ),
  Zap: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </IconBase>
  ),
  Clock: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  ),
  Menu: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </IconBase>
  ),
  Star: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 18l-5.8 3 1.1-6.6L2.5 9.9 9.1 9z" />
    </IconBase>
  ),
  Book: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 4v15a2 2 0 002 2h14V6a2 2 0 00-2-2H6a2 2 0 00-2 2z" />
      <path d="M4 19a2 2 0 012-2h14" />
    </IconBase>
  ),
  Code: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
    </IconBase>
  ),
  Help: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4" />
      <circle cx="12" cy="17" r=".5" fill="currentColor" />
    </IconBase>
  ),
  Bell: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 004 0" />
    </IconBase>
  ),
  Receipt: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h4" />
    </IconBase>
  ),
  Globe: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </IconBase>
  ),
  Copy: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 012-2h10" />
    </IconBase>
  ),
  Eye: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  ),
  EyeOff: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M3 3l18 18M10.6 5.2A10 10 0 0112 5c6.5 0 10 7 10 7a15 15 0 01-3.6 4.4M6.3 6.3A16 16 0 002 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.8" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
    </IconBase>
  ),
  Info: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v0M12 11v6" />
    </IconBase>
  ),
  LogOut: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M10 21H5a2 2 0 01-2-2V5a2 2 0 012-2h5M16 17l5-5-5-5M9 12h12" />
    </IconBase>
  ),
  Send: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M4 20l16-8L4 4l3 8-3 8zM7 12h13" />
    </IconBase>
  ),
  Paperclip: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3 3 0 014 4l-9 9a1 1 0 01-1.5-1.5L15 7" />
    </IconBase>
  ),
  DollarCircle: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9h-3.5a1.5 1.5 0 000 3h1a1.5 1.5 0 010 3H9M12 7v1M12 16v1" />
    </IconBase>
  ),
  Robot: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M12 3v4M8 3l4 4 4-4" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <path d="M9 17h6" />
    </IconBase>
  ),
  Flow: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="3" y="4" width="6" height="5" rx="1" />
      <rect x="15" y="4" width="6" height="5" rx="1" />
      <rect x="9" y="15" width="6" height="5" rx="1" />
      <path d="M6 9v3h12V9M12 12v3" />
    </IconBase>
  ),
  Stop: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </IconBase>
  ),
  Play: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M6 4l14 8-14 8z" />
    </IconBase>
  ),
  Terminal: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </IconBase>
  ),
  Compare: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="3" y="4" width="7" height="16" rx="1" />
      <rect x="14" y="4" width="7" height="16" rx="1" />
      <path d="M10 9h4M10 13h4M10 17h4" />
    </IconBase>
  ),
  Layers: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5" />
    </IconBase>
  ),
  Refresh: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5" />
    </IconBase>
  ),
} as const;

export type IconName = keyof typeof I;
