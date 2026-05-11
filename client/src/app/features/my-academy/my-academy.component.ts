import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyService, MeAcademy } from '../../core/services/academy.service';

/**
 * Athlete-portal "My academy" page (#618, M7 PR-D slice 2). Read-only
 * view onto the academy the user belongs to: name, address, owner
 * contact, logo (or placeholder).
 *
 * Role-agnostic — owners hitting this page see the same shape from
 * the same endpoint. The shell guard sends owners to `/dashboard/*`
 * (their own surface), so in practice only athletes land here.
 *
 * The page is the second of six M7 PR-D slices outlined in the PRD;
 * attendance / payments / documents / profile-edit follow in
 * subsequent slices.
 */
@Component({
  selector: 'app-my-academy',
  standalone: true,
  imports: [TranslatePipe, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-academy.component.html',
  styleUrl: './my-academy.component.scss',
})
export class MyAcademyComponent implements OnInit {
  private readonly academyService = inject(AcademyService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly academy = signal<MeAcademy | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  ngOnInit(): void {
    this.academyService
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (academy) => {
          this.academy.set(academy);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }

  /**
   * Formats the structured address into a single line for the
   * read-only card. Returns null when no address is on file, so the
   * template hides the row entirely (vs rendering an empty line that
   * looks like a layout glitch).
   */
  protected addressLine(academy: MeAcademy): string | null {
    if (academy.address === null) return null;
    const parts: (string | null)[] = [
      academy.address.line1,
      academy.address.line2,
      academy.address.city,
      academy.address.postal_code,
      academy.address.country,
    ];
    const nonEmpty = parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    return nonEmpty.length > 0 ? nonEmpty.join(', ') : null;
  }

  /**
   * Formats the phone pair into a single E.164-ish display string
   * (with a separating space for readability). Null when neither side
   * is filled — the row collapses.
   */
  protected phoneLine(academy: MeAcademy): string | null {
    if (academy.phone_country_code === null || academy.phone_national_number === null) {
      return null;
    }
    return `${academy.phone_country_code} ${academy.phone_national_number}`;
  }

  /**
   * Builds the `tel:` URI from the raw phone parts — no space between
   * country code and national number, since spaces are invalid inside
   * tel URIs (RFC 3966). Same null-guard as `phoneLine`.
   */
  protected phoneHref(academy: MeAcademy): string | null {
    if (academy.phone_country_code === null || academy.phone_national_number === null) {
      return null;
    }
    return `tel:${academy.phone_country_code}${academy.phone_national_number}`;
  }
}
