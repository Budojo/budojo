import { Belt } from '../../core/services/athlete.service';

/** The ten colours every belt is made of (#1801). */
export type BeltColour =
  'white' | 'grey' | 'yellow' | 'orange' | 'green' | 'blue' | 'purple' | 'brown' | 'black' | 'red';

/**
 * A belt as paint: its main colour, and the second colour of a two-colour
 * belt (`<main>-and-<tip>`), or null. Every `Belt` value is built this way, so
 * the split is the rule rather than a table to keep in step — and
 * `belt-palette.spec.ts` checks every value resolves to known colours.
 */
export interface BeltPaint {
  readonly main: BeltColour;
  readonly tip: BeltColour | null;
}

export function beltPaint(belt: Belt): BeltPaint {
  const [main, tip] = belt.split('-and-') as [BeltColour, BeltColour | undefined];

  return { main, tip: tip ?? null };
}

/** The CSS custom property for a colour, for anything that paints with CSS. */
export function beltColourVar(colour: BeltColour): string {
  return `var(--budojo-belt-${colour})`;
}

/** The text colour that sits on `colour` at WCAG AA. */
export function beltInkVar(colour: BeltColour): string {
  return `var(--budojo-belt-${colour}-ink)`;
}

/**
 * The resolved colour, for canvas surfaces (the stats doughnut, the share card)
 * that cannot read a custom property. Empty where no stylesheet is loaded — a
 * unit test's jsdom — and the caller decides what that means for it.
 */
export function resolveBeltColour(
  colour: BeltColour,
  root: Element = document.documentElement,
): string {
  return getComputedStyle(root).getPropertyValue(`--budojo-belt-${colour}`).trim();
}

/**
 * A belt as a canvas fill (#1801): its main colour, or — for a two-colour
 * belt — a tile of the main colour with a band of the second, so taekwondo's
 * red, red-and-black and black-and-red never read as one slice. Chart.js
 * accepts either. Falls back to the main colour where there is no canvas
 * (a unit test's jsdom) or no stylesheet.
 */
export function beltCanvasFill(
  belt: Belt,
  root: Element = document.documentElement,
): string | CanvasPattern {
  const { main, tip } = beltPaint(belt);
  const mainColour = resolveBeltColour(main, root);
  // No stylesheet, no colours to tile — and no reason to ask a jsdom canvas.
  if (tip === null || mainColour === '') return mainColour;

  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const ctx = tile.getContext('2d');
  if (!ctx) return mainColour;

  ctx.fillStyle = mainColour;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = resolveBeltColour(tip, root);
  ctx.fillRect(10, 0, 6, 16);

  return ctx.createPattern(tile, 'repeat') ?? mainColour;
}
