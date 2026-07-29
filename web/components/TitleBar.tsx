import { Search } from "lucide-react";

export interface TitleBarProps {
  /** Reserves space for the macOS traffic-lights on the left, only inside the desktop shell —
   * the browser-dev preview has no native window chrome to make room for. */
  isTauri: boolean;
  /** Name of the currently-selected project, or null when none is selected — shown in the
   * search button's placeholder ("Search <name>…" / "Search projects…"). */
  projectLabel: string | null;
  onOpenSearch: () => void;
}

/**
 * Full-width, Slack-style overlay title bar sitting above the two-rail body (GlobalRail +
 * ProjectMenu + main). Left: a spacer reserving room for the macOS traffic-lights (native side,
 * see `src-tauri/src/main.rs`'s `TitleBarStyle::Overlay`). Center: the global ⌘K search, restored
 * here after the two-rail redesign removed the old top-center bar. Right: a matching spacer so
 * the search stays visually centered.
 *
 * The bar itself is Tauri v2's drag region (`data-tauri-drag-region` — lets the user drag the
 * window by this strip). Only the bare element carrying that attribute participates in dragging;
 * the search button is a separate element without it, so clicks reach it normally with no extra
 * pointer-events overrides needed.
 */
export function TitleBar({ isTauri, projectLabel, onOpenSearch }: TitleBarProps) {
  const label = projectLabel ?? "projects";
  return (
    <div
      data-testid="titlebar"
      data-tauri-drag-region
      className="flex h-[46px] shrink-0 items-center bg-sidebar px-2 text-sidebar-foreground"
    >
      <div data-testid="titlebar-lights-spacer" className={isTauri ? "w-[72px] shrink-0" : "w-0 shrink-0"} />
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search {label}… ⌘K</span>
        </button>
      </div>
      <div data-testid="titlebar-right-spacer" className="w-[72px] shrink-0" />
    </div>
  );
}
