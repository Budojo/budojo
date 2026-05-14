import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Mobile filter bottom-sheet (#704 / mobile audit row 16).
 *
 * Wraps a chip CTA + a slide-up sheet around an arbitrary set of
 * filter controls (passed via `<ng-content>`). Replaces the inline
 * filter row on phone viewports — recovers ~80px of vertical space
 * for the list itself.
 *
 * **Reusable shape**: the component is dumb about which filters live
 * inside; the host page renders its own `<p-select>` / `<input>`
 * controls between the opening + closing tag, owns their bindings,
 * and emits `apply` / `reset` to drive the actual list reload.
 *
 * **Visibility**: the component is meant to be conditionally rendered
 * by the host page via a media-query-driven SCSS rule (`@media
 * (max-width: 767px)`) — the host shows the inline row on desktop and
 * the chip+sheet on mobile. Embedding the media query INSIDE this
 * component would lock the breakpoint; leaving it to the host keeps
 * the component reusable for surfaces that might want a different
 * boundary.
 */
@Component({
  selector: 'app-filter-sheet',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-sheet.component.html',
  styleUrl: './filter-sheet.component.scss',
})
export class FilterSheetComponent {
  /** Number of currently-active filters — rendered as a badge on the chip. */
  readonly activeCount = input<number>(0);

  /** Translation key for the chip label. Defaults to a generic "Filtri". */
  readonly labelKey = input<string>('shared.filterSheet.filters');

  readonly apply = output<void>();
  // Named `resetClick` rather than `reset` because Angular ESLint's
  // `@angular-eslint/no-output-native` rule (rightly) refuses outputs
  // named after a standard DOM event (`reset` is a form event). The
  // alias keeps the contract clear at the call site.
  readonly resetClick = output<void>();

  protected readonly isOpen = signal<boolean>(false);

  protected openSheet(): void {
    this.isOpen.set(true);
  }

  protected closeSheet(): void {
    this.isOpen.set(false);
  }

  protected onApply(): void {
    this.apply.emit();
    this.closeSheet();
  }

  protected onReset(): void {
    this.resetClick.emit();
  }

  /**
   * Esc closes the sheet — Krug § forgiveness + Norman § signifier:
   * the keyboard convention for "dismiss this overlay" is universal,
   * we honour it even when the host doesn't think about it.
   */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.isOpen()) {
      this.closeSheet();
    }
  }
}
