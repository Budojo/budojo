import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AcademyService } from '../../../core/services/academy.service';

/**
 * Academy home — a read-only grouped-list view of the current academy.
 *
 * No own `fetch` call: `hasAcademyGuard` already hydrated
 * `AcademyService.academy()` before routing here, so we read the signal
 * directly. A `null` fallback is still rendered for the first-tick flash
 * and for defensive correctness (a manual `clear()` from devtools, etc.).
 */
@Component({
  selector: 'app-academy-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonModule],
  templateUrl: './academy-detail.component.html',
  styleUrl: './academy-detail.component.scss',
})
export class AcademyDetailComponent {
  private readonly academyService = inject(AcademyService);

  protected readonly academy = this.academyService.academy;
}
