import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { AppLockService } from '../../../core/mobile/app-lock.service';

/**
 * The fingerprint lock's cover (#2159, PRD § 6.1), mounted at the app's root.
 * While the phone is locked it covers everything, and `budojo-locked` on
 * `<html>` hides the rest of the app to the eye, the keyboard and a screen
 * reader alike (`styles.scss`). The rest is kept, not destroyed: a form half
 * filled is still there after the fingerprint. Renders nothing outside the
 * Android app.
 */
@Component({
  selector: 'app-lock',
  imports: [ButtonModule, TranslatePipe],
  templateUrl: './app-lock.component.html',
  styleUrl: './app-lock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLockComponent {
  protected readonly lock = inject(AppLockService);
  private readonly document = inject(DOCUMENT);
  private readonly unlockButton = viewChild('unlockButton', { read: ElementRef });

  constructor() {
    effect(() => {
      this.document.documentElement.classList.toggle('budojo-locked', this.lock.locked());
    });
    // «Sblocca» is disabled while a prompt is up; once it can be pressed, the
    // keyboard and a screen reader start on it.
    afterRenderEffect(() => {
      if (this.lock.locked() && !this.lock.asking()) {
        const element = this.unlockButton()?.nativeElement as HTMLElement | undefined;
        element?.querySelector('button')?.focus();
      }
    });
    // After the first render: the language is set by then, so the prompt's
    // title is in the owner's.
    afterNextRender(() => this.lock.start());
  }
}
