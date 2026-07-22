import type { OpenTarget } from "../api.ts";

// Small, recognizable app marks (brand-colored) for the "Open in…" menu.
const box = "size-4 shrink-0";

function VSCodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className={box} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#1f6feb" />
      <polyline points="9,8 6,12 9,16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15,8 18,12 15,16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg viewBox="0 0 24 24" className={box} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#0b0b0b" />
      <path d="M8.5 6.5 16 12l-3.7.7 1.9 3.6-1.5.8-1.9-3.7-2.3 2.2z" fill="#fff" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" className={box} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#2b2b2b" />
      <polyline points="7,9 10,12 7,15" fill="none" stroke="#3ddc84" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="16" y2="15" stroke="#3ddc84" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ITermIcon() {
  return (
    <svg viewBox="0 0 24 24" className={box} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#111" />
      <polyline points="7,9 10,12 7,15" fill="none" stroke="#35c5cf" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="16" y2="15" stroke="#35c5cf" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FinderIcon() {
  return (
    <svg viewBox="0 0 24 24" className={box} aria-hidden="true">
      <clipPath id="kablan-finder">
        <rect x="2" y="2" width="20" height="20" rx="5" />
      </clipPath>
      <g clipPath="url(#kablan-finder)">
        <rect x="2" y="2" width="10" height="20" fill="#4cb9ff" />
        <rect x="12" y="2" width="10" height="20" fill="#1e86e6" />
        <rect x="8.4" y="6" width="1.3" height="3.6" rx="0.65" fill="#fff" />
        <rect x="14.3" y="6" width="1.3" height="3.6" rx="0.65" fill="#fff" />
        <path d="M9 15c1.8 1.3 4.2 1.3 6 0" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export const OPEN_TARGETS: { id: OpenTarget; label: string; icon: React.ReactNode }[] = [
  { id: "vscode", label: "VS Code", icon: <VSCodeIcon /> },
  { id: "cursor", label: "Cursor", icon: <CursorIcon /> },
  { id: "terminal", label: "Terminal", icon: <TerminalIcon /> },
  { id: "iterm", label: "iTerm", icon: <ITermIcon /> },
  { id: "finder", label: "Finder", icon: <FinderIcon /> },
];
