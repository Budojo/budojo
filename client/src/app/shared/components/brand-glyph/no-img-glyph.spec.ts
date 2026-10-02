import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The glyph is drawn inline, never as an image (#2034).
 *
 * `logo-glyph.svg` strokes with `currentColor`, and an SVG loaded through
 * `<img>` is sandboxed from the page: `currentColor` resolves to the SVG's own
 * root, which is black. So the glyph rendered black on every page that used
 * it that way, whatever its CSS asked for, and on the dark theme the login,
 * register and academy setup pages showed a black mark on a black ground.
 * `app-brand-glyph` draws the same paths inline, so the colour follows the
 * page. This fails on any template that loads the glyph as an image again.
 */
const APP = join(process.cwd(), 'src/app');
const GLYPH_AS_IMAGE = /<img[^>]*logo-glyph\.svg/;

function templates(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return templates(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

describe('the brand glyph', () => {
  it('is never loaded as an image, which would draw it black on any theme', () => {
    const offenders = templates(APP)
      .filter((file) => GLYPH_AS_IMAGE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
