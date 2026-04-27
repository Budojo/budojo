import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { DocumentType } from '../../../core/services/document.service';

export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'none';

interface BadgeSpec {
  label: string;
  severity: 'success' | 'warn' | 'danger' | 'secondary';
}

const SPEC: Record<ExpiryStatus, BadgeSpec | null> = {
  valid: { label: 'Valid', severity: 'success' },
  expiring: { label: 'Expiring', severity: 'warn' },
  expired: { label: 'Expired', severity: 'danger' },
  missing: { label: 'Missing expiry', severity: 'danger' },
  none: null,
};

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

  const expiry = parseDate(expiresAt);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.ceil((expiry.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

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
        [value]="spec()!.label"
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
  readonly expiresAt = input.required<string | null>();
  readonly type = input.required<DocumentType>();
  /** Dependency injection for deterministic tests — defaults to `new Date()` on render. */
  readonly today = input<Date>(new Date());

  readonly status = computed<ExpiryStatus>(() =>
    classifyExpiry(this.expiresAt(), this.type(), this.today()),
  );

  readonly spec = computed<BadgeSpec | null>(() => SPEC[this.status()]);
}
