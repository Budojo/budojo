import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { BrandGlyphComponent } from '../../shared/components/brand-glyph/brand-glyph.component';
import { LanguageService } from '../../core/services/language.service';

/**
 * Public `/help` page (#422). In-product FAQ for users who hit a
 * "how do I…?" question and would otherwise fall back to the in-app
 * feedback form. Self-service first, e-mail-the-owner second.
 *
 * **Structure mirrored from `/whats-new` (#254):**
 * - Typed array of categories + entries declared in the component.
 * - Each entry carries a stable `id` (the anchor) plus translation
 *   keys for its question + answer paragraphs. The `id` is the
 *   contract — empty states / tooltips can deep-link to
 *   `/help#how-to-add-payment` and rely on it.
 * - Content comes from `client/public/assets/i18n/{en,it}.json`
 *   under the `help.entries.<id>.{question,answer}` keys, so every
 *   visible string flows through the `i18n-keys.spec.ts` parity
 *   trip-wire (canon § i18n).
 *
 * **Public route, like `/privacy`.** A user does NOT need to be
 * logged in to read the FAQ — sign-up + setup questions need to be
 * answered before the dashboard is even reachable. The page is also
 * linked from the dashboard sidebar footer alongside `/privacy` so
 * existing customers reach it without leaving the app.
 *
 * **Search: client-side only.** The dataset (10–15 entries) easily
 * fits in memory; no server round-trip, no debounce. We match
 * resolved (translated) question + answer text against the
 * lower-cased query so a user typing in their active language gets
 * intuitive matches without an index.
 *
 * **Anchor behaviour.** `app.config.ts` configures the router with
 * `withInMemoryScrolling({ anchorScrolling: 'enabled' })` so a
 * `[fragment]="id"` link scrolls the matching `<section id="...">`
 * into view. The `routerLink` itself stays on `/help` so anchors
 * survive a `LanguageService.use()` re-render.
 */

interface FaqEntry {
  /** Stable URL anchor (`/help#<id>`). DO NOT rename without a redirect. */
  readonly id: string;
}

interface FaqCategory {
  /** Stable id for grouping + deep links (`/help#cat-<id>`). */
  readonly id: 'getting-started' | 'athletes' | 'attendance' | 'payments' | 'documents' | 'account';
  readonly entries: readonly FaqEntry[];
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    BrandGlyphComponent,
    ButtonModule,
    FormsModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    RouterLink,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
})
export class HelpComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  /** User-typed search query, lowercased on read for matching. */
  readonly query = signal('');

  /**
   * Master list. Order = display order. IDs are URL-stable — pick
   * carefully on first commit, redirect on later renames.
   */
  protected readonly categories: readonly FaqCategory[] = [
    {
      id: 'getting-started',
      entries: [
        { id: 'what-is-budojo' },
        { id: 'create-academy' },
        { id: 'invite-coach' },
      ],
    },
    {
      id: 'athletes',
      entries: [
        { id: 'add-athlete' },
        { id: 'import-athletes' },
        { id: 'belt-not-listed' },
        { id: 'suspend-athlete' },
      ],
    },
    {
      id: 'attendance',
      entries: [
        { id: 'mark-attendance' },
        { id: 'edit-attendance' },
      ],
    },
    {
      id: 'payments',
      entries: [
        { id: 'set-monthly-fee' },
        { id: 'mark-paid' },
        { id: 'unpaid-badge' },
      ],
    },
    {
      id: 'documents',
      entries: [
        { id: 'upload-medical-cert' },
        { id: 'expiring-documents' },
      ],
    },
    {
      id: 'account',
      entries: [
        { id: 'change-language' },
        { id: 'export-data' },
        { id: 'delete-account' },
      ],
    },
  ];

  /**
   * Filtered entries, grouped by category. An empty query returns
   * every category with every entry (the unfiltered tree). A query
   * keeps a category only if AT LEAST ONE entry's resolved
   * question OR answer matches the lowercased substring.
   *
   * Pure derivation from `query()` and the static `categories` —
   * `computed` gives us a free OnPush re-render on input.
   */
  protected readonly filtered = computed<readonly FaqCategory[]>(() => {
    const needle = this.query().trim().toLowerCase();
    // Track the active language signal so a runtime EN ↔ IT flip
    // re-evaluates the matcher with the right bundle. Without this
    // read, `TranslateService.instant()` would return cached text
    // from the old language and the search would lag a tick.
    this.language.currentLang();
    if (needle === '') {
      return this.categories;
    }
    return this.categories
      .map((cat) => ({
        id: cat.id,
        entries: cat.entries.filter((e) => this.entryMatches(e, needle)),
      }))
      .filter((cat) => cat.entries.length > 0);
  });

  /** True when a search yields no matches — surfaces the empty state. */
  protected readonly hasNoMatches = computed(() => this.filtered().length === 0);

  ngOnInit(): void {
    // Pre-seed the query from `?q=`. Lets us deep-link "search results"
    // from elsewhere (e.g. an empty state with "search the FAQ for
    // payments") without duplicating UI. Fragment-based scrolling
    // (`#anchor`) is handled by the router's anchorScrolling.
    const initial = this.route.snapshot.queryParamMap.get('q');
    if (initial) {
      this.query.set(initial);
    }
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  /**
   * True when an entry's translated question OR answer contains the
   * (already lowercased) needle. Reads through `TranslateService`
   * so it picks up the active language reactively — flipping EN/IT
   * re-evaluates `computed` because we read translations every call.
   */
  private entryMatches(entry: FaqEntry, lowercaseNeedle: string): boolean {
    const q = (this.translate.instant(`help.entries.${entry.id}.question`) as string).toLowerCase();
    const a = (this.translate.instant(`help.entries.${entry.id}.answer`) as string).toLowerCase();
    return q.includes(lowercaseNeedle) || a.includes(lowercaseNeedle);
  }
}
