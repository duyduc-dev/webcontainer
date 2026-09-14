import type { CSSProperties } from "react";

// Ported verbatim (attribute names camelCased for JSX) from the Duck Studio
// (Modern) design canvas's inline <symbol> defs.
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-files" viewBox="0 0 24 24">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 2v7h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.3-4.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-git" viewBox="0 0 24 24">
          <path d="M6 3v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="18" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M18 9a9 9 0 0 1-9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-bug" viewBox="0 0 24 24">
          <rect x="8" y="6" width="8" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 6V3M9 6l-2-2M15 6l2-2M4 10h4M16 10h4M4 16h4M16 16h4M9 20l-2 2M15 20l2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-chev-down" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-chev-right" viewBox="0 0 24 24">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-play" viewBox="0 0 24 24">
          <path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="i-share" viewBox="0 0 24 24">
          <circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" fill="none" stroke="currentColor" strokeWidth="2" />
        </symbol>
        <symbol id="i-arrow-left" viewBox="0 0 24 24">
          <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-arrow-right" viewBox="0 0 24 24">
          <path d="M5 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-rotate" viewBox="0 0 24 24">
          <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-ext-link" viewBox="0 0 24 24">
          <path d="M14 4h6v6M20 4L10 14M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-globe" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="2" />
        </symbol>
        <symbol id="i-terminal" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M7 9l3 3-3 3M13 15h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-file-plus" viewBox="0 0 24 24">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M13 2v7h7M9 15h6M12 12v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-template" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="14" y="3" width="7" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="14" y="12" width="7" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="3" y="16" width="7" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
        </symbol>
        <symbol id="i-folder-import" viewBox="0 0 24 24">
          <path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 13h6m0 0l-2-2m2 2l-2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-github" viewBox="0 0 24 24">
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.68-4.58 4.93.36.31.68.92.68 1.85v2.75c0 .26.18.57.69.48A10 10 0 0 0 12 2z" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="i-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v5l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-lock" viewBox="0 0 24 24">
          <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
      </defs>
    </svg>
  );
}

export type IconName =
  | "files"
  | "search"
  | "git"
  | "bug"
  | "gear"
  | "chev-down"
  | "chev-right"
  | "x"
  | "plus"
  | "play"
  | "share"
  | "arrow-left"
  | "arrow-right"
  | "rotate"
  | "ext-link"
  | "globe"
  | "terminal"
  | "file-plus"
  | "template"
  | "folder-import"
  | "github"
  | "clock"
  | "lock"
  | "moon"
  | "sun";

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} className={className} style={style} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
