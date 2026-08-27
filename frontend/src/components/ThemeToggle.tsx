import { Moon, Sun } from 'lucide-react';
import { ThemeMode } from 'shared/types';
import { useTheme } from '@/components/ThemeProvider';
import { useUserSystem } from '@/components/ConfigProvider';
import { getActualTheme } from '@/utils/theme';

/**
 * One-click light/dark switch for the header.
 *
 * The theme was only reachable through Settings before. This flips it immediately for feedback
 * AND persists it through the same config path Settings uses — the provider seeds itself from
 * config on load, so a toggle that only set local state would silently revert on reload.
 *
 * A "system" theme resolves to whatever it currently renders as, then toggles away from that, so
 * the first click always visibly changes something.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { config, updateAndSaveConfig } = useUserSystem();

  const isDark = getActualTheme(theme) === 'dark';
  const next = isDark ? ThemeMode.LIGHT : ThemeMode.DARK;

  const toggle = async () => {
    setTheme(next);
    if (!config) return;
    try {
      // Pass ONLY the delta: updateAndSaveConfig merges into the current config itself, so
      // spreading the whole object would write back a snapshot and could rewind other fields.
      await updateAndSaveConfig({ theme: next });
    } catch (err) {
      // Non-fatal: the theme still changed for this session.
      console.error('Failed to persist theme preference:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
