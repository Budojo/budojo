import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { type AthletePromotion, AthleteService } from '../../../../core/services/athlete.service';
import { BeltBadgeComponent } from '../../../../shared/components/belt-badge/belt-badge.component';

/**
 * Owner-facing timeline of an athlete's belt + stripe promotion
 * history (post-v2.9.0). Reads `/api/v1/athletes/{id}/promotions`
 * — server writes the rows in lock-step with the
 * AthleteObserver's CommunityPost emission so the timeline stays
 * in sync with the community feed.
 *
 * Two row shapes, discriminated by `kind`:
 * - `belt`: shows the transition `<old belt> → <new belt>` (old
 *   may be null on first assignment).
 * - `stripe`: shows the transition `<n> → <m> stripes` next to a
 *   small belt badge so the visual context is preserved.
 *
 * Pagination: 20/page, prev / next buttons. Mobile-first card
 * list — date primary, transition secondary, recorder tertiary.
 */
@Component({
  selector: 'app-promotions-list',
  standalone: true,
  imports: [
    DatePipe,
    TranslatePipe,
    ButtonModule,
    SkeletonModule,
    TooltipModule,
    BeltBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promotions-list.component.html',
  styleUrl: './promotions-list.component.scss',
})
export class PromotionsListComponent implements OnInit {
  private readonly athleteService = inject(AthleteService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly promotions = signal<readonly AthletePromotion[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);

  private athleteId = 0;

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    this.athleteId = raw !== null ? Number.parseInt(raw, 10) : 0;
    if (this.athleteId > 0) {
      this.load(1);
    }
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.athleteService
      .promotions(this.athleteId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.promotions.set(resp.data);
          this.currentPage.set(resp.meta.current_page);
          this.lastPage.set(resp.meta.last_page);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  protected nextPage(): void {
    if (this.currentPage() < this.lastPage()) this.load(this.currentPage() + 1);
  }

  protected previousPage(): void {
    if (this.currentPage() > 1) this.load(this.currentPage() - 1);
  }
}
