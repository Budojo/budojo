import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

import { Athlete } from '../../core/services/athlete.service';
import { SearchService } from '../../core/services/search.service';
import { BeltBadgeComponent } from '../../shared/components/belt-badge/belt-badge.component';
import { STATUS_KEYS } from '../../shared/utils/i18n-enum-keys';

/**
 * Global Cmd/Ctrl-K command palette (#426).
 *
 * Mounted once at the dashboard shell so the keyboard shortcut works on
 * every authenticated route. The component is a thin coordinator: it
 * listens for the global hotkey, owns the dialog open/closed signal,
 * holds the input + result list, and delegates the wire call to
 * `SearchService`.
 *
 * Why a HostListener at component level instead of a global service: the
 * palette IS the only consumer of Cmd/Ctrl-K today and Angular handles
 * teardown automatically when the dashboard unmounts. A standalone
 * `KeyboardShortcutService` would be cleaner the day a SECOND shortcut
 * arrives (Rule of Three) — until then it's accidental complexity.
 *
 * Norman / Krug compliance:
 *   - Affordance: the dialog header carries a search-icon input + the
 *     active hotkey hint; the user always sees what they typed and what
 *     the kbd is.
 *   - Feedback: 200 ms debounce → result list updates inside the
 *     Doherty threshold for "feels live"; the empty + no-results states
 *     are explicit, not silent.
 *   - Constraint: empty query renders an empty state (no spurious load).
 *   - ArrowUp/Down + Enter mirrors every CMD palette the user has muscle
 *     memory for (Jakob).
 */
@Component({
  selector: 'app-search-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TranslatePipe,
    BeltBadgeComponent,
  ],
  templateUrl: './search-palette.component.html',
  styleUrl: './search-palette.component.scss',
})
export class SearchPaletteComponent {
  private readonly searchService = inject(SearchService);
  private readonly router = inject(Router);

  /**
   * Open / closed state of the palette dialog. Bound directly to
   * `<p-dialog [visible]>` via two-way binding so PrimeNG's escape /
   * mask-click dismiss flows write back here without manual plumbing.
   */
  readonly open = signal(false);

  /**
   * Current value of the input. The template's `[ngModel]` writes to
   * this signal; the debounced pipeline below reads from it on every
   * change.
   */
  readonly query = signal('');

  /**
   * Last fetched result list. Bounded server-side at 20 entries; we
   * mirror that cap implicitly by trusting the response (no client-side
   * truncation). Empty array on initial state, on whitespace-only query,
   * on no-match.
   */
  readonly results = signal<Athlete[]>([]);

  /**
   * Currently focused row in the result list — driven by ArrowUp /
   * ArrowDown and consumed by Enter. Always defaults to 0 so the FIRST
   * result is selected when Enter fires immediately after a search.
   */
  readonly activeIndex = signal(0);

  /**
   * Loading-state surface for the template. Flips on when the user types
   * (after the debounce window) and back off when the response lands.
   * Same Doherty / Norman-feedback contract as athletes-list.
   */
  readonly loading = signal(false);

  /**
   * Detail-row metadata derived from the active athlete row. Renders
   * the status pill alongside the belt badge for disambiguation per the
   * issue ("results show belt + status badge for disambiguation").
   */
  readonly statusKeys = STATUS_KEYS;

  /**
   * Convenience computed for the empty-state branch. The template
   * splits into three states: empty hint (no query), no-results
   * (query but zero matches), or the result list.
   */
  readonly hasQuery = computed(() => this.query().trim().length > 0);

  /**
   * Debounce window in milliseconds. 200 ms — Doherty < 400 ms threshold,
   * "feels live", same value athletes-list uses for its search.
   */
  static readonly DEBOUNCE_MS = 200;

  private readonly inputSubject = new Subject<string>();

  constructor() {
    // Reset activeIndex any time the result set changes — without this,
    // "third row selected" leaks from a previous result list into a new
    // smaller one.
    effect(() => {
      // Read `results` to make this effect signal-dependent.
      this.results();
      this.activeIndex.set(0);
    });

    this.inputSubject
      .pipe(
        debounceTime(SearchPaletteComponent.DEBOUNCE_MS),
        map((q) => q.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => this.fireSearch(q));

    // Push every signal write into the debouncer. Using an effect rather
    // than a template-side `(ngModelChange)` keeps the contract
    // testable: a unit test can `cmp.query.set('mario')` and trigger the
    // pipeline without rendering.
    effect(() => {
      const q = this.query();
      if (this.open()) {
        this.inputSubject.next(q);
      }
    });
  }

  /**
   * Test helper — manually drive a query through the search pipeline,
   * bypassing the rxjs debounce. Vitest's environment doesn't ship
   * `zone.js/testing`, so we expose this affordance instead of forcing
   * a `fakeAsync` setup. Production code goes through the debounced
   * subject; specs can call this directly to assert the wire shape.
   */
  triggerSearchNow(q: string): void {
    this.fireSearch(q.trim());
  }

  /**
   * Global hotkey listener. Cmd+K on macOS, Ctrl+K elsewhere. We don't
   * try to detect the platform — we just accept either modifier. The
   * shortcut both opens AND toggles closed if it's already open
   * (matches Linear / Slack / VS Code muscle memory).
   *
   * `preventDefault` is mandatory on the browser-level Cmd+K (which
   * normally focuses the address bar in Chrome / Edge). Without it the
   * dialog opens but the user's typing then disappears into the URL
   * bar.
   */
  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    // The `key` comparison is case-insensitive — Cmd+Shift+K should
    // also open (some users have caps-lock or shift habits) but the
    // common case is `key === 'k'`.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.open.update((v) => !v);
    }
  }

  /**
   * Result-list keyboard navigation. ArrowUp / ArrowDown wraps at the
   * boundaries (Slack / Linear behaviour) so the user can never get
   * "stuck" at row 0 or row N-1. Enter selects the active result.
   *
   * Wired from the input + the list container so a user who never
   * leaves the input keyboard-focus still gets full navigation.
   */
  handleListKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    if (count === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => (i - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.results()[this.activeIndex()];
      if (row !== undefined) {
        this.selectAthlete(row);
      }
    }
  }

  selectAthlete(athlete: Athlete): void {
    this.handleClose();
    void this.router.navigate(['/dashboard/athletes', athlete.id]);
  }

  /**
   * Close the dialog and reset transient state. Bound to `(visibleChange)`
   * on `<p-dialog>` so escape / mask-click both flow through here. The
   * reset is intentional: opening the palette should always start from
   * a blank slate, never from the previous query (Krug — every open is
   * a new question; the previous answer would mis-prime the user).
   */
  handleClose(): void {
    this.open.set(false);
    this.query.set('');
    this.results.set([]);
    this.activeIndex.set(0);
  }

  private fireSearch(q: string): void {
    if (q === '') {
      this.results.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.searchService.searchAthletes(q).subscribe({
      next: (rows) => {
        this.results.set(rows);
        this.loading.set(false);
      },
      error: () => {
        // Swallow errors silently for V1 — the palette is a non-
        // critical surface, and a noisy toast on a flaky network
        // would be more annoying than helpful. The empty-state
        // branch covers the visible UX.
        this.results.set([]);
        this.loading.set(false);
      },
    });
  }
}
