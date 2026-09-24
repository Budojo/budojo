import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Tooltip } from 'primeng/tooltip';
import { contactLinks } from '../../utils/contact-links';

/**
 * Message or call an athlete, from any list that names them (#1727).
 *
 * The retention lists (#1729, #1730) are worthless if reaching the person
 * means going back to the roster and opening them; on a build with no mail
 * server, the link IS the feature. WhatsApp comes first because a Windows
 * desktop often has no `tel:` handler at all — the call link is not wrong
 * there, it may just do nothing.
 *
 * Anchors, not buttons: both are navigations. WhatsApp opens in a new tab —
 * a web page must not replace the app — and the desktop shell hands every
 * `https` window to the system browser. `tel:` takes no target: it goes to
 * the operating system, and a blank tab for it leaves an empty window.
 *
 * The number itself is never shown. It is personal data on screens that get
 * turned towards other people, and pressing does not need it. With no number
 * the component still renders — disabled, and saying why — because a row
 * that silently lacks the action reads as a rendering bug.
 */
@Component({
  selector: 'app-contact-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Tooltip],
  templateUrl: './contact-actions.component.html',
  styleUrl: './contact-actions.component.scss',
})
export class ContactActionsComponent {
  readonly countryCode = input<string | null | undefined>(null);
  readonly nationalNumber = input<string | null | undefined>(null);
  /** Who the actions reach — it names them in the screen-reader labels. */
  readonly name = input.required<string>();
  /** Prefix for the three `data-cy` hooks: `<prefix>-whatsapp`, `-call`, `-none`. */
  readonly dataCy = input<string | null>(null);

  protected readonly links = computed(() =>
    contactLinks(this.countryCode(), this.nationalNumber()),
  );

  protected cy(suffix: string): string | null {
    const prefix = this.dataCy();
    return prefix ? `${prefix}-${suffix}` : null;
  }
}
