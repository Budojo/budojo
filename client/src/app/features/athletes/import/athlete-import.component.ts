import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AthleteService,
  type AthleteImportMappingError,
  type AthleteImportReport,
  type AthleteImportRow,
} from '../../../core/services/athlete.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { BELT_KEYS } from '../../../shared/utils/i18n-enum-keys';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../../shared/utils/locale';
import type { Belt } from '../../../core/services/athlete.service';

/** The fields a file cannot be imported without. Mirrors the server's list. */
const REQUIRED_FIELDS = ['first_name', 'last_name', 'belt'];

/**
 * Import a roster from a CSV (#1346).
 *
 * Three states on one screen, in the order they happen: pick a file, look at
 * what would happen, confirm. Not a wizard with steps to navigate — there is
 * nothing to go back to except choosing a different file, and a stepper would
 * add chrome to a job that is over in two clicks.
 *
 * **The preview is the feature.** A real file's dates are ambiguous
 * (`03/04/2019` is 3 April here and 4 March in an American sheet), its belts
 * are in another language, and its columns are named by whoever made it. No
 * parser settles that reliably. What settles it is showing the owner the
 * parsed result — the actual dates, the actual belts — before a single row is
 * written, and the server refuses to write until asked twice.
 *
 * The mapping is shown **even when the guess is right**, because a guess the
 * user never saw is one they cannot correct, and the cost of being wrong here
 * is sixty records with surnames in the first-name column.
 */
@Component({
  selector: 'app-athlete-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TranslatePipe,
    PageHeaderComponent,
  ],
  templateUrl: './athlete-import.component.html',
  styleUrl: './athlete-import.component.scss',
})
export class AthleteImportComponent {
  private readonly athletes = inject(AthleteService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly file = signal<File | null>(null);
  protected readonly report = signal<AthleteImportReport | null>(null);
  protected readonly busy = signal<boolean>(false);
  protected readonly imported = signal<number | null>(null);

  /**
   * The columns the server said are missing, when it refused the mapping.
   *
   * Held apart from a generic error message because it is **actionable on
   * this screen**: the file is fine, one dropdown is empty, and the user fixes
   * it here rather than going back to Excel.
   */
  protected readonly missing = signal<string[]>([]);
  protected readonly columns = signal<string[]>([]);

  /** field → column, edited in place. Seeded from the server's guess. */
  protected readonly mapping = signal<Record<string, string>>({});

  protected readonly requiredFields = REQUIRED_FIELDS;

  /** `null` is a real option: a column the user wants left unmapped. */
  protected readonly columnOptions = computed(() => [
    { label: this.translate.instant('athletes.import.mapping.none'), value: '' },
    ...this.columns().map((column) => ({ label: column, value: column })),
  ]);

  protected readonly okCount = computed<number>(
    () => this.report()?.rows.filter((row) => row.status === 'ok').length ?? 0,
  );

  protected readonly canImport = computed<boolean>(
    () => this.okCount() > 0 && !this.busy() && this.imported() === null,
  );

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0] ?? null;
    if (chosen === null) {
      return;
    }

    // Reset everything a previous file left behind. Without this, choosing a
    // second file after a failed mapping would show the new file's rows under
    // the old file's error.
    this.file.set(chosen);
    this.report.set(null);
    this.imported.set(null);
    this.missing.set([]);
    this.mapping.set({});
    this.preview();
  }

  /** Ask what would happen. Never writes: the server's default is a dry run. */
  protected preview(): void {
    const file = this.file();
    if (file === null) {
      return;
    }

    this.busy.set(true);
    this.athletes
      .importAthletes(file, { dryRun: true, mapping: this.mapping() })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.columns.set(report.columns);
          this.mapping.set({ ...report.mapping });
          this.missing.set([]);
        },
        error: (error: HttpErrorResponse) => this.onPreviewError(error),
      });
  }

  /**
   * A 422 naming unmapped columns is not a failure to report — it is the
   * mapping step, arrived at from the other side. Keep the file, show the
   * columns, and let the user point the dropdowns at the right ones.
   */
  private onPreviewError(error: HttpErrorResponse): void {
    const body = error.error as Partial<AthleteImportMappingError> | null;

    if (error.status === 422 && Array.isArray(body?.missing)) {
      this.missing.set(body.missing);
      this.columns.set(body.columns ?? []);
      this.mapping.set({ ...(body.mapping ?? {}) });
      this.report.set(null);

      return;
    }

    this.messages.add({
      severity: 'error',
      summary: this.translate.instant('athletes.import.error.title'),
      detail:
        typeof body?.message === 'string'
          ? body.message
          : this.translate.instant('athletes.import.error.generic'),
    });
  }

  /** The second call, and the only one that writes. */
  protected confirm(): void {
    const file = this.file();
    if (file === null || !this.canImport()) {
      return;
    }

    this.busy.set(true);
    this.athletes
      .importAthletes(file, { dryRun: false, mapping: this.mapping() })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.imported.set(report.imported);
          this.messages.add({
            severity: 'success',
            summary: this.translate.instant('athletes.import.toast.title'),
            detail: this.translate.instant(
              report.imported === 1
                ? 'athletes.import.toast.bodyOne'
                : 'athletes.import.toast.bodyOther',
              { count: report.imported },
            ),
          });
        },
        error: (error: HttpErrorResponse) => this.onPreviewError(error),
      });
  }

  /** Re-preview when a dropdown changes, so the table always matches the mapping. */
  protected onMappingChange(field: string, column: string): void {
    this.mapping.update((current) => ({ ...current, [field]: column }));
    this.preview();
  }

  protected goToRoster(): void {
    void this.router.navigate(['/dashboard/athletes']);
  }

  protected nameOf(row: AthleteImportRow): string {
    const first = typeof row.values['first_name'] === 'string' ? row.values['first_name'] : '';
    const last = typeof row.values['last_name'] === 'string' ? row.values['last_name'] : '';

    return `${first} ${last}`.trim();
  }

  protected valueOf(row: AthleteImportRow, field: string): string {
    const value = row.values[field];

    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  /**
   * The belt in the owner's language, not the API's.
   *
   * The preview exists to be CHECKED, and `blue` is a word this app never
   * otherwise shows an Italian instructor — asking them to verify a parse
   * against vocabulary they do not use defeats the point of showing it.
   * Reuses `BELT_KEYS`, whose exhaustive `Record<Belt, string>` is what makes
   * a new belt a compile error rather than a blank cell.
   */
  protected beltLabel(row: AthleteImportRow): string {
    const value = this.valueOf(row, 'belt');
    const key = BELT_KEYS[value as Belt] as string | undefined;

    return key === undefined ? value : this.translate.instant(key);
  }

  /**
   * A date the way the file wrote it, not the way the wire carries it.
   *
   * The single most valuable thing on this screen is proving that
   * `15/03/1990` was read as 15 March. Handing back `1990-03-15` asks the
   * owner to do that conversion in their head — on precisely the ambiguity
   * the preview exists to settle.
   */
  protected dateLabel(row: AthleteImportRow, field: string): string {
    const iso = this.valueOf(row, field);
    if (iso === '') {
      return '';
    }

    const parsed = new Date(`${iso}T00:00:00`);

    return Number.isNaN(parsed.getTime())
      ? iso
      : parsed.toLocaleDateString(localeFor(this.language.currentLang()));
  }

  /** Flattened for display: the field name is already the row's own column. */
  protected reasonFor(row: AthleteImportRow): string {
    if (row.status === 'duplicate') {
      return this.translate.instant('athletes.import.reason.duplicate');
    }

    return Object.values(row.errors).flat().join(' · ');
  }

  protected severityFor(row: AthleteImportRow): 'success' | 'warn' | 'danger' {
    if (row.status === 'ok') {
      return 'success';
    }

    return row.status === 'duplicate' ? 'warn' : 'danger';
  }
}
