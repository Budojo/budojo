import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BrandGlyphComponent } from '../brand-glyph/brand-glyph.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { BottomNavTab } from '../bottom-nav/bottom-nav.component';

/** The rail brand — a logo (or glyph fallback) + label, linking to the shell's home. */
export interface RailBrand {
  /** Visible brand text — also the link's accessible name (no aria-label override). */
  readonly label: string;
  /** Academy/brand logo URL; `null` → the inline Budojo glyph fallback. */
  readonly logoUrl: string | null;
  /** The "home" destination. */
  readonly routerLink: string | readonly unknown[];
}

/** The profile chip pinned at the bottom of the rail (the account anchor). */
export interface RailProfile {
  readonly name: string | null;
  readonly avatarUrl: string | null;
  readonly handle: string | null;
  /** Where the chip navigates — the "me / more" hub. */
  readonly routerLink: string | readonly unknown[];
}

/**
 * Social-native desktop side rail (#1120) — the Instagram/X left-rail shell,
 * shared by the owner (`dashboard`) + athlete (`athlete-dashboard`) shells
 * (extracted from the duplicated rail chrome shipped in #1110 / #1112).
 * Presentational: the host supplies the same `tabs` it feeds the bottom-nav
 * plus a role-specific `brand` + `profile`, and reacts to `createActivated`.
 *
 * a11y:
 * - the host element is the `role="navigation"` landmark (label via `ariaLabel`);
 *   tabs are `<a routerLinkActive>` carrying `aria-current="page"` on the active route.
 * - the keyboard focus ring comes from the GLOBAL `:focus-visible` rule
 *   (`budojo-variants.scss`, the `--budojo-focus-ring-*` tokens) — the rail's
 *   interactive elements only re-declare `border-radius` so the ring rounds to
 *   their own shape (#1114 canon: no local outline). Fixes #1119 — every
 *   interactive rail element now shows a focus ring, not only the brand.
 * - the brand link carries no `aria-label`, so its accessible name is the
 *   visible brand text (WCAG 2.5.3 label-in-name — #1119: the owner academy
 *   name is no longer hidden behind a generic "go to home" label).
 */
@Component({
  selector: 'app-side-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, BrandGlyphComponent, UserAvatarComponent],
  templateUrl: './side-rail.component.html',
  styleUrl: './side-rail.component.scss',
  host: {
    role: 'navigation',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class SideRailComponent {
  /** Primary destinations — the same array the host feeds the bottom-nav. */
  readonly tabs = input.required<BottomNavTab[]>();
  /** Brand (logo + label) linking to the shell's home. */
  readonly brand = input.required<RailBrand>();
  /** Profile chip pinned at the bottom; `null` → omitted (e.g. user not yet hydrated). */
  readonly profile = input<RailProfile | null>(null);
  /** Visible label on the ➕ Create button (translated by the host). */
  readonly createLabel = input.required<string>();
  /** The `<nav>` landmark label (translated by the host). */
  readonly ariaLabel = input.required<string>();

  /** Fires when the ➕ Create button is activated. */
  readonly createActivated = output<void>();
}
