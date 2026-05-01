import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { Athlete, AthleteService, AthleteStatus } from '../../../core/services/athlete.service';
import { AgeBadgeComponent } from '../../../shared/components/age-badge/age-badge.component';
import { BeltBadgeComponent } from '../../../shared/components/belt-badge/belt-badge.component';

@Component({
  selector: 'app-athlete-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    ButtonModule,
    TabsModule,
    TagModule,
    AgeBadgeComponent,
    BeltBadgeComponent,
  ],
  templateUrl: './athlete-detail.component.html',
  styleUrl: './athlete-detail.component.scss',
})
export class AthleteDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly athleteService = inject(AthleteService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly athlete = signal<Athlete | null>(null);
  readonly activeTab = signal<string>('documents');

  readonly fullName = computed(() => {
    const a = this.athlete();
    return a ? `${a.first_name} ${a.last_name}` : '';
  });

  /**
   * Contact links (#162) — same shape as the academy detail page. Emits
   * only the populated channels so the header row can collapse when
   * they're all empty (no grey-icon noise for a roster of athletes who
   * haven't shared their socials). Returns an empty array when none
   * are filled; the template guards on `links.length > 0`.
   *
   * URLs are passed through verbatim — the form-layer validator
   * restricts input to http/https, so the SPA doesn't sanitize again.
   */
  readonly contactLinks = computed<{ icon: string; url: string; label: string }[]>(() => {
    const a = this.athlete();
    if (!a) return [];
    const links: { icon: string; url: string; label: string }[] = [];
    if (a.website) links.push({ icon: 'pi pi-globe', url: a.website, label: 'Website' });
    if (a.facebook) links.push({ icon: 'pi pi-facebook', url: a.facebook, label: 'Facebook' });
    if (a.instagram) links.push({ icon: 'pi pi-instagram', url: a.instagram, label: 'Instagram' });
    return links;
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) return;
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        void this.router.navigate(['/dashboard/athletes']);
        return;
      }
      this.loadAthlete(id);
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.activeTab.set(this.tabFromUrl(e.urlAfterRedirects)));
    this.activeTab.set(this.tabFromUrl(this.router.url));
  }

  private tabFromUrl(url: string): string {
    if (url.includes('/payments')) return 'payments';
    if (url.includes('/attendance')) return 'attendance';
    if (url.includes('/edit')) return 'edit';
    return 'documents';
  }

  statusSeverity(status: AthleteStatus): 'success' | 'warn' | 'secondary' {
    switch (status) {
      case 'active':
        return 'success';
      case 'suspended':
        return 'warn';
      case 'inactive':
        return 'secondary';
    }
  }

  statusLabel(status: AthleteStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private loadAthlete(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.athleteService
      .get(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (a) => this.athlete.set(a),
        error: () => this.error.set('Could not load this athlete.'),
      });
  }
}
