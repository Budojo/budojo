import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Inline Budojo brand glyph. Renders the same paths as
 * `client/public/logo-glyph.svg` but inline in the host page so
 * `stroke="currentColor"` actually inherits the host CSS color
 * (an `<img>`-loaded SVG is sandboxed and resolves currentColor to
 * black — see `.claude/gotchas.md` § Design system).
 *
 * The host element is `display: inline-flex` and the `<svg>` fills
 * 100% of it, so callers size the glyph on the host (`class="..."`
 * with width/height) and the SVG follows.
 */
@Component({
  selector: 'app-brand-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <g stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 10 L32 38 L32 54" stroke-width="5" />
        <path d="M50 10 L32 38" stroke-width="5" />
        <path d="M16 40 L48 40" stroke-width="6" />
        <path d="M29 38 L29 44 L35 44 L35 38" stroke-width="4" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class BrandGlyphComponent {}
