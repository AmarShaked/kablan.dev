import { useSyncExternalStore } from "react";
import {
  Box,
  Folder,
  FolderGit2,
  Rocket,
  Zap,
  Star,
  Heart,
  Flag,
  Bookmark,
  Bug,
  Code,
  Terminal,
  Globe,
  Database,
  Server,
  Cloud,
  Cpu,
  Layers,
  LayoutDashboard,
  Palette,
  Sparkles,
  Package,
  ShoppingCart,
  CreditCard,
  Users,
  MessageSquare,
  Calendar,
  SquareKanban,
  GitBranch,
  Shield,
  Bell,
  Image,
  Music,
  Film,
  BookOpen,
  Coffee,
  Leaf,
  Flame,
  Compass,
  Target,
  Trophy,
  Gift,
  Wrench,
  Beaker,
  type LucideIcon,
} from "lucide-react";

/** Curated icon set for projects (Linear/Notion-style). */
export const ICONS: Record<string, LucideIcon> = {
  box: Box,
  folder: Folder,
  "folder-git": FolderGit2,
  rocket: Rocket,
  zap: Zap,
  star: Star,
  heart: Heart,
  flag: Flag,
  bookmark: Bookmark,
  bug: Bug,
  code: Code,
  terminal: Terminal,
  globe: Globe,
  database: Database,
  server: Server,
  cloud: Cloud,
  cpu: Cpu,
  layers: Layers,
  dashboard: LayoutDashboard,
  palette: Palette,
  sparkles: Sparkles,
  package: Package,
  cart: ShoppingCart,
  card: CreditCard,
  users: Users,
  message: MessageSquare,
  calendar: Calendar,
  kanban: SquareKanban,
  branch: GitBranch,
  shield: Shield,
  bell: Bell,
  image: Image,
  music: Music,
  film: Film,
  book: BookOpen,
  coffee: Coffee,
  leaf: Leaf,
  flame: Flame,
  compass: Compass,
  target: Target,
  trophy: Trophy,
  gift: Gift,
  wrench: Wrench,
  beaker: Beaker,
};

export const ICON_NAMES = Object.keys(ICONS);
export const DEFAULT_ICON = "box";

// --- localStorage-backed store (shared across the app, reactive) ---
const KEY = "projectIcons";

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

let icons: Record<string, string> = load();
const listeners = new Set<() => void>();

function emit() {
  localStorage.setItem(KEY, JSON.stringify(icons));
  listeners.forEach((l) => l());
}

export function setProjectIcon(project: string, icon: string) {
  icons = { ...icons, [project]: icon };
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Reactive map of project → icon name. */
export function useProjectIcons() {
  return useSyncExternalStore(subscribe, () => icons);
}

export function iconNameFor(project: string, map: Record<string, string> = icons): string {
  return map[project] ?? DEFAULT_ICON;
}

/** Render a project's icon by icon-name (falls back to the default). */
export function ProjectIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? ICONS[DEFAULT_ICON];
  return <Icon className={className} />;
}
