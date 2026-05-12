import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommunityPost, CommunityService } from '../../../core/services/community.service';

/**
 * Owner-only "Post event" composer dialog (#640, follow-up to the
 * server-side `POST /api/v1/community/events` shipped in #632). Sits
 * inside `MyFeedComponent` as a child component; the parent gates
 * the open trigger on the caller's role so athletes never see the
 * dialog.
 *
 * V1 surfaces a minimal field set matching the server contract:
 * title (required, 1-120 chars), description (optional, max 2000),
 * starts_at (required ISO 8601 date-time), location_text (optional,
 * max 200), max_attendees (optional, 1-10_000). lat / lon are V2
 * map view and stay out of the V1 form.
 *
 * On submit:
 * 1. Disable the submit + show inline spinner.
 * 2. Call `communityService.createEvent` — server normalises
 *    starts_at to canonical UTC and returns the full post payload.
 * 3. Emit `created` so the parent can prepend the new post to the
 *    local feed (optimistic reconciliation).
 * 4. Close the dialog + show a success toast.
 *
 * On error: keep the dialog open, show a toast, restore the submit
 * button so the user can retry without re-typing.
 */
@Component({
  selector: 'app-event-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    DatePickerModule,
    InputNumberModule,
    TranslatePipe,
  ],
  templateUrl: './event-composer.component.html',
  styleUrl: './event-composer.component.scss',
})
export class EventComposerComponent {
  private readonly communityService = inject(CommunityService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  readonly visible = input<boolean>(false);
  readonly visibleChange = output<boolean>();
  readonly created = output<CommunityPost>();

  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(120)]],
    starts_at: [null as Date | null, [Validators.required]],
    description: ['', [Validators.maxLength(2000)]],
    location_text: ['', [Validators.maxLength(200)]],
    max_attendees: [null as number | null, [Validators.min(1), Validators.max(10000)]],
  });

  protected onClose(): void {
    if (this.submitting()) return;
    this.visibleChange.emit(false);
    this.form.reset({
      title: '',
      starts_at: null,
      description: '',
      location_text: '',
      max_attendees: null,
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    if (raw.starts_at === null) return;

    this.submitting.set(true);
    this.communityService
      .createEvent({
        title: raw.title.trim(),
        // Send the local-tz ISO string; the server re-parses through
        // Carbon and re-serialises to canonical UTC, so the wire-side
        // is always the same regardless of where the form ran.
        starts_at: raw.starts_at.toISOString(),
        description: raw.description.trim() === '' ? null : raw.description.trim(),
        location_text: raw.location_text.trim() === '' ? null : raw.location_text.trim(),
        max_attendees: raw.max_attendees,
      })
      .subscribe({
        next: (post) => {
          this.created.emit(post);
          this.submitting.set(false);
          this.visibleChange.emit(false);
          this.form.reset({
            title: '',
            starts_at: null,
            description: '',
            location_text: '',
            max_attendees: null,
          });
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('community.composer.successSummary'),
            detail: this.translate.instant('community.composer.successDetail'),
            life: 4000,
          });
        },
        error: () => {
          this.submitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('community.composer.errorSummary'),
            detail: this.translate.instant('community.composer.errorDetail'),
            life: 5000,
          });
        },
      });
  }
}
