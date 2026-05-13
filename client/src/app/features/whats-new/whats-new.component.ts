import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { RELEASES, type Release } from './whats-new.releases';

/**
 * "What's new" page (#254). User-facing changelog for non-technical
 * users (Luigi, an instructor, not a developer). Sits in the sidebar
 * above Sign out so a user reading the dashboard can answer "did
 * something change?" without leaving the app.
 *
 * **Two artefacts, one content domain.** The canonical changelog
 * source lives in `docs/changelog/user-facing/v{X.Y.Z}.md` — one
 * markdown file per release, written in plain English with light
 * emoji use in section headers. This component renders a hand-
 * tailored version of the same content as a typed `Release[]`
 * array. The two are NOT auto-generated; they are kept in lock-
 * step under the documentation discipline documented in
 * `CLAUDE.md` § "User-facing changelog (#254)": a release PR
 * adds the markdown file AND prepends the array entry in the
 * same commit history.
 *
 * Why the parallel artefacts: the markdown files are the citable
 * source (auditable in the repo, easy to rewrite, easy to diff in
 * a PR review); the typed array gives Angular full design control
 * over typography, semantic HTML structure, and accessibility
 * without dragging in a markdown parser dependency.
 *
 * The release dataset lives in a sibling file (`whats-new.releases.ts`)
 * so this component file stays focused on the template / router glue
 * and per-release diffs read cleanly against the data alone.
 *
 * Auth: this is a route inside the dashboard shell so it's behind
 * the auth + has-academy guards. We deliberately do NOT make it
 * public the way `/privacy` and `/sub-processors` are — the
 * audience here is logged-in customers who just want to know what
 * changed, not regulators or prospects.
 */
@Component({
  selector: 'app-whats-new',
  standalone: true,
  imports: [ButtonModule, BrandGlyphComponent, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './whats-new.component.html',
  styleUrl: './whats-new.component.scss',
})
export class WhatsNewComponent {
  private readonly router = inject(Router);

  protected readonly releases: readonly Release[] = RELEASES;

  goHome(): void {
    this.router.navigateByUrl('/dashboard');
  }
}
