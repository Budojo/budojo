import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import {
  ExposureAthlete,
  ExposureState,
  StatsService,
  TopicExposure,
} from '../../../../core/services/stats.service';
import { LanguageService } from '../../../../core/services/language.service';
import { AthleteIdentityComponent } from '../../../../shared/components/athlete-identity/athlete-identity.component';
import { localeFor } from '../../../../shared/utils/locale';

interface ExposureGroup {
  readonly state: ExposureState;
  readonly active: readonly ExposureAthlete[];
  readonly inactive: readonly ExposureAthlete[];
}

/**
 * Seen, then seen once, then never — the order the question is asked in — and
 * last, apart, the people the record cannot place.
 */
const STATES: readonly ExposureState[] = ['seen', 'thin', 'never', 'unplaced'];

/**
 * Who has seen one technique this season (#1745) — a row of the coverage
 * report, opened.
 *
 * The athlete × technique matrix read one column at a time, which is how it
 * is used: before a private lesson, before a promotion, before deciding
 * tonight's class. It lists the held lessons that taught it, then the roster
 * split three ways against them.
 *
 * **Not a scoreboard.** People come in the server's register order, active
 * before inactive; nothing here sorts them by how much they have seen, no row
 * carries a percentage, and `never` is a roster filtered by a fact, drawn in
 * the same ink as the other two. A technique nobody taught opens to a sentence
 * that says so, never to a roster filed under "never" (#1567).
 */
@Component({
  selector: 'app-topic-exposure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    SkeletonModule,
    AthleteIdentityComponent,
  ],
  templateUrl: './topic-exposure.component.html',
  styleUrl: './topic-exposure.component.scss',
})
export class TopicExposureComponent {
  private readonly stats = inject(StatsService);
  private readonly languageService = inject(LanguageService);

  /** Two-way, so the report can open it and the dialog can close itself. */
  readonly visible = model<boolean>(false);
  readonly topicId = input<number | null>(null);
  /** The season the report is showing, so the drill-down reads the same one. */
  readonly seasonsBack = input<number>(0);

  protected readonly loading = signal<boolean>(true);
  protected readonly failed = signal<boolean>(false);
  protected readonly report = signal<TopicExposure | null>(null);

  /** Bumped by the retry button; the effect below watches it. */
  private readonly reloadTick = signal<number>(0);

  constructor() {
    // Opening is the load, and `onCleanup` cancels a read the next opening
    // overtakes — two quick clicks on two rows must not paint the first
    // technique under the second one's name.
    effect((onCleanup) => {
      const id = this.topicId();
      const seasonsBack = this.seasonsBack();
      this.reloadTick();
      if (!this.visible() || id === null) return;

      this.loading.set(true);
      this.failed.set(false);
      this.report.set(null);

      const sub = this.stats.topicExposure(id, seasonsBack).subscribe({
        next: (report) => {
          this.report.set(report);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Nobody taught it this season: the academy's gap, said as one sentence. */
  protected readonly nobodyYet = computed<boolean>(
    () => (this.report()?.lessons.length ?? 0) === 0,
  );

  /**
   * The three states, each split into active and inactive, keeping the
   * server's register order inside both. A state with nobody in it is left
   * out rather than drawn as an empty heading.
   */
  protected readonly groups = computed<readonly ExposureGroup[]>(() => {
    const athletes = this.report()?.athletes ?? [];
    return STATES.map((state) => {
      const rows = athletes.filter((a) => a.state === state);
      return {
        state,
        active: rows.filter((a) => a.status === 'active'),
        inactive: rows.filter((a) => a.status !== 'active'),
      };
    }).filter((g) => g.active.length + g.inactive.length > 0);
  });

  /** "2 at two or more" — the group's heading, with its One/Other pair. */
  protected groupKey(group: ExposureGroup): string {
    const count = group.active.length + group.inactive.length;
    return `stats.syllabus.exposure.${group.state}${count === 1 ? 'One' : 'Other'}`;
  }

  protected groupCount(group: ExposureGroup): number {
    return group.active.length + group.inactive.length;
  }

  /** "Wed 16 Sep" — a lesson is an evening, so the weekday helps place it. */
  protected lessonDay(iso: string): string {
    return this.format(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** "16 Sep" — beside a person, the last evening they were there for it. */
  protected shortDay(iso: string): string {
    return this.format(iso, { day: 'numeric', month: 'short' });
  }

  /**
   * A calendar day the server recorded, in the reader's language. Built from
   * its parts rather than parsed as an instant, so it never slides a day west
   * of Greenwich (#1537).
   */
  private format(iso: string, options: Intl.DateTimeFormatOptions): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), options).format(
      new Date(y, m - 1, d),
    );
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }
}
