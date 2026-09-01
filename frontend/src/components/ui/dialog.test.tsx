import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';

/**
 * The invariant a real regression broke.
 *
 * `Dialog` used to be a hand-rolled component that drew its own backdrop and centred box around
 * whatever children it was given. It is now Radix's `Root`, which renders non-portal children
 * exactly where they sit in the tree — so a dialog whose body is a direct child of `Dialog`
 * silently stops being a dialog: no overlay, no centring, no focus trap, the form laid out inline
 * in the page. Nothing throws and nothing is logged, which is what made it hard to spot.
 *
 * The first test pins the primitive's behaviour; the second checks every dialog in the app still
 * follows the rule it implies.
 */
describe('Dialog', () => {
  it('presents content passed to DialogContent', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Rename branch</DialogTitle>
          <p>body</p>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('body');
  });

  it('does not present children given directly to the root', () => {
    render(
      <Dialog open>
        <p>body</p>
      </Dialog>
    );

    // The text is on the page, but nothing about it is a dialog — this is the failure mode the
    // structural test below exists to prevent.
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/** Every .tsx under src, so a dialog added in a new folder is covered without editing this. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() &&
      full.endsWith('.tsx') &&
      !full.endsWith('.test.tsx')
      ? [full]
      : [];
  });
}

describe('dialog usage', () => {
  it('puts its body inside DialogContent', () => {
    const src = path.resolve(__dirname, '../..');
    const offenders = sourceFiles(src)
      .filter((file) => file !== path.join(src, 'components/ui/dialog.tsx'))
      .filter((file) => {
        const text = fs.readFileSync(file, 'utf8');
        // `<Dialog>` or `<Dialog ` only — not DialogContent, DialogHeader, AlertDialog…
        const rendersRoot = /<Dialog[\s>]/.test(text);
        return rendersRoot && !text.includes('<DialogContent');
      })
      .map((file) => path.relative(src, file));

    expect(offenders).toEqual([]);
  });
});
