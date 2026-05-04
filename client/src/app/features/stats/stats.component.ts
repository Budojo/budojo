import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TabsModule } from 'primeng/tabs';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TabsModule, RouterOutlet, RouterLink, TranslatePipe],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Tab definitions — order is the visible tab strip order. `value`
   * doubles as the URL segment under `/dashboard/stats/`. Mirrors
   * athlete-detail's tab pattern (see athlete-detail.component.html).
   */
  protected readonly tabs = [
    { value: 'overview', labelKey: 'stats.tabs.overview', dataCy: 'stats-tab-overview' },
    { value: 'attendance', labelKey: 'stats.tabs.attendance', dataCy: 'stats-tab-attendance' },
    { value: 'payments', labelKey: 'stats.tabs.payments', dataCy: 'stats-tab-payments' },
    { value: 'athletes', labelKey: 'stats.tabs.athletes', dataCy: 'stats-tab-athletes' },
  ] as const;

  /**
   * Active tab tracks the current URL — the firstChild of the stats
   * route carries the segment as its `path`. Mirrors the same idiom
   * used by athlete-detail.component (activeTab signal).
   *
   * Defensive optional chaining at every level (#382): the `startWith(null)`
   * branch fires the map synchronously during component construction,
   * at which point — under in-app navigation with PreloadAllModules
   * (#376) — `route.firstChild` can be attached to the route tree
   * BEFORE its `snapshot` has been populated. The original chain
   * `firstChild?.snapshot.url[0]?.path` only short-circuited on
   * `firstChild`, so a transient `firstChild` with an undefined
   * `snapshot` produced a `TypeError: Cannot read properties of
   * undefined (reading 'url')` — exactly the prod blank-page reported
   * after v1.14.1. Adding `?.` after every step keeps every transient
   * shape graceful.
   */
  protected readonly activeTab = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.route.firstChild?.snapshot?.url?.[0]?.path ?? 'overview'),
    ),
    { initialValue: 'overview' },
  );
}
