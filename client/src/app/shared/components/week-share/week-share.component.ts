import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import type { AcademyClass } from '../../../core/services/academy-class.service';
import { AcademyService } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { StatsService, SyllabusCalendar } from '../../../core/services/stats.service';
import { whatsappShareLink } from '../../utils/contact-links';
import { localeFor } from '../../utils/locale';
import {
  PublishedWeek,
  WeekSchedule,
  clockOf,
  publishedWeek,
  weekMessageText,
} from '../../utils/week-message';
import { weekMessageLabels } from '../../utils/week-message-labels';

/**
 * "Manda la settimana al gruppo" (#1940): the week's message, from the
 * screen where the week is planned.
 *
 * Every class on the timetable with its time, its topics where planned, and
 * the closed days — the message the group asks "a che ora?" of when it lacks
 * them. One button that opens two ways to send: copy the text, or open
 * WhatsApp on it. Nothing drawn while there is no week to send.
 */
@Component({
  selector: 'app-week-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ButtonModule, MenuModule],
  template: `
    @if (message() !== null) {
      <!-- A native button, so aria-haspopup sits on the element a screen
           reader announces. Secondary: the page's primary CTA is its own. -->
      <button
        pButton
        type="button"
        severity="secondary"
        aria-haspopup="menu"
        [attr.aria-label]="ariaLabel()"
        (click)="openMenu($event)"
        data-cy="week-share"
      >
        <i class="pi pi-send" pButtonIcon aria-hidden="true"></i>
        <span pButtonLabel>{{ 'weekMessage.send' | translate }}</span>
      </button>
      <p-menu #menu [popup]="true" [model]="items()" appendTo="body" />
    }
  `,
})
export class WeekShareComponent {
  private readonly stats = inject(StatsService);
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly messages = inject(MessageService);

  /** The timetable the page already holds; read once here would be twice. */
  readonly classes = input<readonly AcademyClass[]>([]);

  private readonly calendar = signal<SyllabusCalendar | null>(null);
  /** The owner's local time, read when the page opens. */
  private readonly clock = signal<string>(clockOf(new Date()));
  private readonly menu = viewChild<Menu>('menu');

  constructor() {
    // The whole academy's programme, whatever filter any other screen holds:
    // the group is every athlete. A failure leaves the button out, no more.
    const sub = this.stats.syllabusCalendar().subscribe({
      next: (calendar) => this.calendar.set(calendar),
      error: () => this.calendar.set(null),
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  private readonly schedule = computed<WeekSchedule>(() => ({
    classes: this.classes(),
    closures: this.academyService.academy()?.closures ?? [],
  }));

  private readonly week = computed<PublishedWeek | null>(() => {
    const calendar = this.calendar();
    return calendar === null ? null : publishedWeek(calendar, this.clock(), this.schedule());
  });

  /** The message itself, or null when there is no week to send. */
  protected readonly message = computed<string | null>(() => {
    const lang = this.languageService.currentLang(); // signal dep — the words follow the toggle
    const calendar = this.calendar();
    const week = this.week();
    if (calendar === null || week?.kind !== 'week') return null;

    return weekMessageText(
      calendar,
      week.week,
      this.clock(),
      weekMessageLabels(this.translate, lang),
      this.schedule(),
    );
  });

  /** "Manda al gruppo la settimana del 12 ott": which week the button sends. */
  protected readonly ariaLabel = computed<string>(() => {
    const lang = this.languageService.currentLang();
    const week = this.week();
    if (week?.kind !== 'week') return this.translate.instant('weekMessage.send');
    const [y, m, d] = week.week.split('-').map(Number);
    const date = new Intl.DateTimeFormat(localeFor(lang), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
    return this.translate.instant('weekMessage.sendAria', { date });
  });

  protected readonly items = computed<MenuItem[]>(() => {
    this.languageService.currentLang();
    const message = this.message();
    if (message === null) return [];
    return [
      {
        label: this.translate.instant('weekMessage.copy'),
        icon: 'pi pi-copy',
        command: () => void this.copy(message),
      },
      {
        label: this.translate.instant('weekMessage.whatsapp'),
        icon: 'pi pi-whatsapp',
        url: whatsappShareLink(message),
        target: '_blank',
      },
    ];
  });

  protected openMenu(event: Event): void {
    // The clock moves while the page stays open: Sunday afternoon becomes
    // Sunday evening, and the week the message is about moves with it.
    this.clock.set(clockOf(new Date()));
    this.menu()?.toggle(event);
  }

  /** Copies the week, the way the season map copies it. */
  private async copy(message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(message);
      this.messages.add({
        severity: 'success',
        summary: this.translate.instant('weekMessage.copied'),
      });
    } catch {
      // The clipboard can be refused; the WhatsApp item carries the same text.
      this.messages.add({
        severity: 'info',
        summary: this.translate.instant('weekMessage.copyFailed'),
      });
    }
  }
}
