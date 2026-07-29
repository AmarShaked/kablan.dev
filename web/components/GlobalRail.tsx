import { Inbox, Settings, Sun, Moon, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type GlobalRailActive = "inbox" | "settings" | null;

export interface GlobalRailProps {
  inboxCount: number;
  active: GlobalRailActive;
  onInbox: () => void;
  onSettings: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex w-12 shrink-0 flex-col items-center gap-1 rounded-md py-2 text-[10px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-50",
        active && "bg-white/10 text-neutral-50",
      )}
    >
      <Icon className="size-[18px]" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-1 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/**
 * The narrow, always-dark global rail (Slack-style) — the app's outermost navigation column.
 * A Kablan logo tile at top; Inbox (with an unread badge) and Settings below it; a Theme toggle
 * and a user-avatar placeholder pinned to the bottom (behind a divider). Fixed width, no scroll —
 * project-scoped browsing lives one column over, in `ProjectMenu`.
 */
export function GlobalRail({ inboxCount, active, onInbox, onSettings, theme, onToggleTheme }: GlobalRailProps) {
  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center gap-1 bg-neutral-950 py-3">
      <div
        aria-label="Kablan.dev"
        className="mb-2 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
      >
        K
      </div>

      <RailButton icon={Inbox} label="Inbox" active={active === "inbox"} onClick={onInbox} badge={inboxCount} />
      <RailButton icon={Settings} label="Settings" active={active === "settings"} onClick={onSettings} />

      <div className="flex-1" />

      <div className="flex w-full flex-col items-center gap-2 border-t border-white/10 pt-2">
        <RailButton
          icon={theme === "dark" ? Sun : Moon}
          label="Theme"
          onClick={onToggleTheme}
        />
        <div
          aria-label="User"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-neutral-300"
        >
          <User className="size-4" />
        </div>
      </div>
    </div>
  );
}
