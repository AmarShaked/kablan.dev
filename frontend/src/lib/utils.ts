import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Join class names, and let the last one win where two of them set the same thing.
 *
 * The merge was disabled here for a while, on the grounds that it could not tell this project's
 * custom classes apart — `text-brand` is a colour and `text-base` is a font size, and a merge
 * that lumped them together would silently drop one. That does not happen on the version we are
 * on: every custom colour, size and spacing key in tailwind.new.config.js survives a merge, and
 * `utils.test.ts` holds the cases so it stays that way.
 *
 * Without it `cn` was only clsx, so nothing was ever resolved — a component's `className` did not
 * override the variant it was given, both classes went into the list, and the cascade picked
 * whichever Tailwind happened to emit last. `<Button size="sm" className="h-8 w-8 p-0">` kept the
 * variant's `px-3`: 24px of padding in a 32px button, which crushed the one icon in the app that
 * is an <img> to a sliver. That is the bug this prevents, and it had reached four components.
 *
 * A variant-prefixed class is not a conflict with a plain one — `md:peer-data-[…]:m-2` and `mr-0`
 * both survive, since they apply under different conditions — so overriding one of those still
 * needs `!`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: bigint | null | undefined): string {
  if (!bytes) return '';
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}
