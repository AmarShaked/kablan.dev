#!/usr/bin/env node
/**
 * Draws the Kablan mark once, and writes every place it has to appear.
 *
 * The mark is "Commit K": a K whose junction is a commit node, whose upper arm is the branch an
 * attempt is running on, and whose lower arm merges back. The letter and the git graph are the
 * same drawing rather than two symbols sitting next to each other, and amber means here what it
 * means everywhere in the app — the attempt that is running.
 *
 * Run after changing the mark:
 *   node scripts/generate-icons.js && npx tauri icon assets/icon-source.svg -o src-tauri/icons
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// The app's own tokens, so the icon cannot drift from the interface.
const INK = '#141414';
const CREAM = '#EDE9E0';
const AMBER = '#FF8C00';

/**
 * The mark on a 100-unit grid. `fg` draws the base branch and the merge, `accent` the attempt
 * that is running. `id` names this file's mask, so several of these can share a page.
 */
function mark({ fg, accent }, id) {
  // The commit node is a real hole rather than a disc painted in the background colour: on the
  // tab favicons there is no background to paint with, and a filled node just lets the trunk
  // show through the middle. Masking the interior out works on a tile and on nothing alike.
  return [
    `<mask id="node-${id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">`,
    `  <rect x="-50" y="-50" width="200" height="200" fill="#fff"/>`,
    `  <circle cx="31" cy="50" r="10" fill="#000"/>`,
    `</mask>`,
    `<g mask="url(#node-${id})">`,
    `  <path d="M31 17 V83" stroke="${fg}" stroke-width="9.4" stroke-linecap="round"/>`,
    `  <path d="M33 50 L66 22" stroke="${accent}" stroke-width="9.4" stroke-linecap="round"/>`,
    `  <path d="M33 50 L66 81" stroke="${fg}" stroke-width="9.4" stroke-linecap="round"/>`,
    `</g>`,
    `<circle cx="31" cy="50" r="10" fill="none" stroke="${fg}" stroke-width="6.6"/>`,
    `<circle cx="69" cy="19" r="8.6" fill="${accent}"/>`,
  ].join('\n    ');
}

/**
 * The mark's real ink extents on the 100-unit grid, stroke widths included. Fitting to the grid
 * instead of to these leaves the artwork stranded in the middle of a tile, because the mark
 * neither fills its grid nor sits centred in it — the branch tip pushes it right.
 */
const BBOX = { x: 26.3, y: 12.3, w: 51.3, h: 75.4 };

/**
 * Transform that scales the mark until its height is `fraction` of `canvas`, and centres its ink
 * on the canvas.
 */
function fit(fraction, canvas) {
  const scale = (fraction * canvas) / BBOX.h;
  const cx = BBOX.x + BBOX.w / 2;
  const cy = BBOX.y + BBOX.h / 2;
  const tx = canvas / 2 - cx * scale;
  const ty = canvas / 2 - cy * scale;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`;
}

function svg(body, { size = 100 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n  ${body}\n</svg>\n`;
}

const files = {
  // Browser tab, light chrome: no tile, so the node punches through to the page.
  'frontend/public/favicon-kablan-light.svg': svg(
    `<g transform="${fit(0.88, 100)}">\n    ${mark({ fg: INK, accent: AMBER }, 'light')}\n  </g>`
  ),

  // Browser tab, dark chrome.
  'frontend/public/favicon-kablan-dark.svg': svg(
    `<g transform="${fit(0.88, 100)}">\n    ${mark({ fg: CREAM, accent: AMBER }, 'dark')}\n  </g>`
  ),

  // Maskable: full bleed, because the platform crops it to its own shape. The mark is scaled
  // into the safe zone so a circular crop cannot clip the branch.
  'frontend/public/favicon-kablan-maskable.svg': svg(
    `<rect width="100" height="100" fill="${INK}"/>\n` +
      `  <g transform="${fit(0.6, 100)}">\n    ` +
      mark({ fg: CREAM, accent: AMBER }, 'maskable') +
      '\n  </g>'
  ),

  // The site's tab icon: a rounded tile, so it reads as the app rather than as a glyph.
  'landing/favicon.svg': svg(
    `<rect width="100" height="100" rx="22" fill="${INK}"/>\n` +
      `  <g transform="${fit(0.58, 100)}">\n    ` +
      mark({ fg: CREAM, accent: AMBER }, 'site') +
      '\n  </g>'
  ),

  // The source every platform icon is generated from. A macOS icon is a rounded tile inset in a
  // transparent square, and Tauri resizes this as-is rather than adding the shape itself.
  'assets/icon-source.svg': svg(
    `<rect x="92" y="92" width="840" height="840" rx="188" fill="${INK}"/>\n` +
      `  <g transform="${fit((0.56 * 840) / 1024, 1024)}">\n    ` +
      mark({ fg: CREAM, accent: AMBER }, 'app') +
      '\n  </g>',
    { size: 1024 }
  ),
};

for (const [rel, content] of Object.entries(files)) {
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  console.log('wrote', rel);
}
