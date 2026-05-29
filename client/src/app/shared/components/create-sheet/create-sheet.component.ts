import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { RouterLink } from '@angular/router';

/** A quick-create action rendered as a row in the create sheet. */
export interface CreateSheetAction {
  /** `pi pi-*` glyph. */
  readonly icon: string;
  /** Visible (translated) label. */
  readonly label: string;
  /** Router destination for the action. */
  readonly routerLink: string | readonly unknown[];
  /** Cypress hook. */
  readonly dataCy?: string;
}

/**
 * Role-aware create sheet (#1107 / #1109) — the slide-up opened by the
 * bottom-nav center ➕. A `<p-dialog styleClass="bottom-sheet">`, so the
 * canonical mobile bottom-sheet chrome (slide-up animation, elevation,
 * safe-area, top radius) comes from the global rule in `budojo-theme.scss`
 * — no hand-rolled backdrop/animation. p-dialog also gives the modal mask,
 * Esc-to-close, focus trap and `role="dialog"` / `aria-modal` for free.
 *
 * Presentational: the host supplies the role's `actions` (athlete:
 * check-in / post; owner: mark attendance / + athlete / post) and opens
 * the sheet via the public `open()` when the bottom-nav emits
 * `centerActivated`.
 */
@Component({
  selector: 'app-create-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule, RouterLink],
  templateUrl: './create-sheet.component.html',
  styleUrl: './create-sheet.component.scss',
})
export class CreateSheetComponent {
  /** Role-aware quick actions (icon + label + route). */
  readonly actions = input.required<CreateSheetAction[]>();
  /** Sheet heading — the host passes a translated string. */
  readonly heading = input.required<string>();

  protected readonly isOpen = signal<boolean>(false);

  /** Open the sheet — called by the host on the bottom-nav ➕. */
  open(): void {
    this.isOpen.set(true);
  }

  /** Close the sheet — on action select / mask / Esc. */
  close(): void {
    this.isOpen.set(false);
  }
}
