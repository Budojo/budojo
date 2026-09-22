import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ThemePreference, ThemeService } from '../../../core/services/theme.service';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly labelKey: string;
  readonly icon: string;
}

/**
 * Theme picker (#1793) — the language sheet's twin, for the same reason: a
 * settings entry that opens a slide-up list with the active value checked.
 *
 * Three options, not a switch. `system` is the default and a real answer —
 * "follow the phone" is what most people want and what keeps the app dark at
 * night and light in the morning without anyone touching it. A two-state
 * toggle cannot say that, and making it a switch would force a choice on
 * somebody who does not have one.
 */
@Component({
  selector: 'app-theme-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule, TranslatePipe],
  templateUrl: './theme-sheet.component.html',
  styleUrl: './theme-sheet.component.scss',
})
export class ThemeSheetComponent {
  private readonly themeService = inject(ThemeService);

  protected readonly preference = this.themeService.preference;
  /** What is painted, so `system` can say which way it currently resolves. */
  protected readonly resolved = this.themeService.resolved;
  protected readonly isOpen = signal<boolean>(false);

  protected readonly options: readonly ThemeOption[] = [
    { value: 'system', labelKey: 'theme.system', icon: 'pi pi-desktop' },
    { value: 'light', labelKey: 'theme.light', icon: 'pi pi-sun' },
    { value: 'dark', labelKey: 'theme.dark', icon: 'pi pi-moon' },
  ];

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  protected select(value: ThemePreference): void {
    this.themeService.setPreference(value);
    this.close();
  }
}
