import {
  Bell, BookOpen, Bookmark, Box, Bug, Calendar, Cloud, Code, Coffee, Compass, CreditCard, Database, Files, Film, Flag, Flame, FolderGit2, FolderOpen, Gift, GitBranch, Globe, Heart, Image, Kanban, Layers, LayoutGrid, Leaf, MessageSquare, Monitor, Music, Package, Palette, Rocket, Server, Shield, ShoppingCart, Sparkles, SquareTerminal, Star, Target, Trophy, Users, Wrench, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The icons a project can be given, keyed by the string stored on `project.icon`.
 *
 * Keys are persisted in the database, so renaming one orphans every project already using it —
 * add new entries rather than renaming existing ones. Unknown keys fall back to the default.
 */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  box: Box, folder: FolderOpen, repo: FolderGit2, rocket: Rocket, zap: Zap,
  star: Star, heart: Heart, flag: Flag, bookmark: Bookmark, bug: Bug,
  code: Code, terminal: SquareTerminal, globe: Globe, database: Database,
  server: Server, cloud: Cloud, monitor: Monitor, layers: Layers,
  grid: LayoutGrid, palette: Palette, sparkles: Sparkles, package: Package,
  cart: ShoppingCart, card: CreditCard, users: Users, chat: MessageSquare,
  calendar: Calendar, kanban: Kanban, branch: GitBranch, shield: Shield,
  bell: Bell, image: Image, music: Music, film: Film, book: BookOpen,
  coffee: Coffee, leaf: Leaf, flame: Flame, compass: Compass, target: Target,
  trophy: Trophy, gift: Gift, wrench: Wrench, files: Files,
};

/** The glyph for a project's stored icon key, falling back when unset or unrecognised. */
export function projectIcon(key: string | null | undefined): LucideIcon {
  return (key && PROJECT_ICONS[key]) || Box;
}
