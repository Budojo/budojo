import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { LanguageService } from '../../../core/services/language.service';
import { DocumentType } from '../../../core/services/document.service';

export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'none';

interface BadgeSpec {
  /** Translation key — the labels were hard-coded English until #1625. */
  labelKey: string;
  severity: 'success' | 'warn' | 'danger' | 'secondary';
}

const SPEC: Record<ExpiryStatus, BadgeSpec | null> = {
  valid: { labelKey: 'shared.expiryBadge.valid', severity: 'success' },
  expiring: { labelKey: 'shared.expiryBadge.expiring', severity: 'warn' },
  expired: { labelKey: 'shared.expiryBadge.expired', severity: 'danger' },
  missing: { labelKey: 'shared.expiryBadge.missing', severity: 'danger' },
  none: null,
};

// The server's `ResolveCertificateStatusAction::EXPIRY_WARNING_DAYS` is this
// number in the other dialect (#1732): move one and the athlete's badge and
// the academy's compliance figure disagree about the same certificate.
const EXPIRY_WARNING_DAYS = 30;

/**
 * Classify a document's expiry state from `expires_at` + `type`.
 * Exported so the badge component and any future logic (e.g. dashboard
 * widget) can share the exact same rules — see PRD P0.7.
 */
export function classifyExpiry(
  expiresAt: string | null,
  type: DocumentType,
  today: Date = new Date(),
): ExpiryStatus {
  if (expiresAt === null) {
    // A medical certificate with no expiry is a red flag; other types without
    // expiry are neutral (ID cards often don't carry an expiry in the DB).
    return type === 'medical_certificate' ? 'missing' : 'none';
  }

  const diffDays = daysUntilExpiry(expiresAt, today) as number;

  if (diffDays < 0) return 'expired';
  if (diffDays <= EXPIRY_WARNING_DAYS) return 'expiring';
  return 'valid';
}

function parseDate(iso: string): Date {
  // Same pattern as athlete-form: numeric parts to guarantee local midnight
  // across browsers. Avoids the Safari ISO-parsing inconsistency.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-expiry-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule],
  template: `
    @if (spec()) {
      <p-tag
        [value]="label()"
        [severity]="spec()!.severity"
        [rounded]="true"
        data-cy="expiry-badge"
      />
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
    `,
  ],
})
export class ExpiryStatusBadgeComponent {
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly expiresAt = input.required<string | null>();
  readonly type = input.required<DocumentType>();
  /** Dependency injection for deterministic tests — defaults to `new Date()` on render. */
  readonly today = input<Date>(new Date());

  readonly status = computed<ExpiryStatus>(() =>
    classifyExpiry(this.expiresAt(), this.type(), this.today()),
  );

  readonly spec = computed<BadgeSpec | null>(() => SPEC[this.status()]);

  /** The tag's own word, in the reader's language. */
  readonly label = computed<string>(() => {
    this.language.currentLang();
    const spec = this.spec();
    return spec === null ? '' : (this.translate.instant(spec.labelKey) as string);
  });
}

/**
 * Whole days from today to an expiry — negative once it is past, null when
 * there is no expiry to count to. `classifyExpiry` divides by it, so the
 * badge's colour and the words beside it can never disagree.
 *
 * **Counted in calendar days, not in milliseconds.** A difference in ms
 * divided by 86,400,000 is off by one whenever the clocks change between the
 * two dates: in Europe/Rome, 24 October to 23 November is 30 days and that
 * arithmetic called it 31 — a certificate one day inside the warning window
 * rendered green. The March change produced `-0` for *yesterday*, so a
 * document that had just expired read "scade oggi" in amber instead of red
 * (#1625). Day numbers from `Date.UTC` have no hours in them to lose.
 */
export function daysUntilExpiry(expiresAt: string | null, today: Date = new Date()): number | null {
  if (expiresAt === null) return null;
  const expiry = parseDate(expiresAt);
  return dayNumber(expiry) - dayNumber(today);
}

/**
 * Which phrase says how long is left, and the number to put in it. The page
 * that renders it does the translating — the badge shows a tag, not a
 * sentence — but the choice of phrase lives here, next to the counting, so
 * there is one place where "1" picks the singular (#1625).
 */
export function expiryCountdownKey(days: number): { key: string; count: number } {
  if (days === 0) return { key: 'shared.expiryCountdown.today', count: 0 };
  const count = Math.abs(days);
  const key =
    days > 0
      ? count === 1
        ? 'shared.expiryCountdown.futureOne'
        : 'shared.expiryCountdown.futureOther'
      : count === 1
        ? 'shared.expiryCountdown.pastOne'
        : 'shared.expiryCountdown.pastOther';
  return { key, count };
}

/** Days since the epoch for a date's own calendar day, ignoring its clock. */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
