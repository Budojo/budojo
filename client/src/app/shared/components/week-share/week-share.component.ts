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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { WeekSchedule, clockOf, timetableWeek, weekMessageText } from '../../utils/week-message';
import { weekMessageLabels } from '../../utils/week-message-labels';

/**
 * "Manda la settimana al gruppo" (#1940): the week's message, from the
 * screen where the week is planned.
 *
 * Every class on the timetable with its time, its topics where planned, and
 * the closed days — the message the group asks "a che ora?" of when it lacks
 * them. One button that opens two ways to send: copy the text, or open
 * WhatsApp on it, under the week they send.
 *
 * Always drawn. With no week to send — the programme still loading, or not
 * loaded, or nothing on either week — the menu says why where the week would
 * be, and the two ways to send stay, disabled: an action that vanishes
 * teaches nobody that it exists (the season map's rule, #1863).
 */
@Component({
  selector: 'app-week-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ButtonModule, MenuModule],
  template: `
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
    <!-- The group's label is the week, or the reason; it names the menu too,
         since PrimeNG draws a group label outside the menu's roles. -->
    <p-menu
      #menu
      [popup]="true"
      [model]="items()"
      [ariaLabel]="heading()"
      [style]="{ 'max-width': '20rem' }"
      appendTo="body"
    />
  `,
})
export class WeekShareComponent {
  private readonly stats = inject(StatsService);
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  /** The timetable the page already holds; read once here would be twice. */
  readonly classes = input<readonly AcademyClass[]>([]);

  private readonly calendar = signal<SyllabusCalendar | 'loading' | 'failed'>('loading');
  /** The owner's local time, read when the page opens. */
  private readonly clock = signal<string>(clockOf(new Date()));
  private readonly menu = viewChild<Menu>('menu');

  constructor() {
    this.load();
  }

  private readonly schedule = computed<WeekSchedule>(() => ({
    classes: this.classes(),
    closures: this.academyService.academy()?.closures ?? [],
  }));

  /** The Monday of the week the button sends; null with none to send. */
  private readonly week = computed<string | null>(() => {
    const calendar = this.calendar();
    return typeof calendar === 'string'
      ? null
      : timetableWeek(calendar, this.clock(), this.schedule());
  });

  /** The message itself, or null when there is no week to send. */
  protected readonly message = computed<string | null>(() => {
    const lang = this.languageService.currentLang(); // signal dep — the words follow the toggle
    const calendar = this.calendar();
    const week = this.week();
    if (typeof calendar === 'string' || week === null) return null;

    return weekMessageText(
      calendar,
      week,
      this.clock(),
      weekMessageLabels(this.translate, lang),
      this.schedule(),
    );
  });

  /** "La settimana del 12 ott" — or why there is no week to send. */
  protected readonly heading = computed<string>(() => {
    this.languageService.currentLang();
    const calendar = this.calendar();
    const week = this.week();
    if (calendar === 'loading') return this.translate.instant('weekMessage.loading');
    if (calendar === 'failed') return this.translate.instant('weekMessage.failed');
    if (week === null) return this.translate.instant('weekMessage.none');
    return this.translate.instant('weekMessage.ready', { date: this.shortDate(week) });
  });

  /** "Manda al gruppo la settimana del 12 ott": which week the button sends. */
  protected readonly ariaLabel = computed<string>(() => {
    this.languageService.currentLang();
    const week = this.week();
    return week === null
      ? this.translate.instant('weekMessage.send')
      : this.translate.instant('weekMessage.sendAria', { date: this.shortDate(week) });
  });

  protected readonly items = computed<MenuItem[]>(() => {
    this.languageService.currentLang();
    const label = this.heading();
    if (this.calendar() === 'failed') {
      return [
        {
          label,
          items: [
            {
              label: this.translate.instant('weekMessage.retry'),
              icon: 'pi pi-refresh',
              command: () => this.load(),
            },
          ],
        },
      ];
    }

    const message = this.message();
    return [
      {
        label,
        items: [
          {
            label: this.translate.instant('weekMessage.copy'),
            icon: 'pi pi-copy',
            disabled: message === null,
            command: () => {
              if (message !== null) void this.copy(message);
            },
          },
          {
            label: this.translate.instant('weekMessage.whatsapp'),
            icon: 'pi pi-whatsapp',
            disabled: message === null,
            ...(message === null ? {} : { url: whatsappShareLink(message), target: '_blank' }),
          },
        ],
      },
    ];
  });

  protected openMenu(event: Event): void {
    // The clock moves while the page stays open: Sunday afternoon becomes
    // Sunday evening, and the week the message is about moves with it.
    this.clock.set(clockOf(new Date()));
    this.menu()?.toggle(event);
  }

  /**
   * The whole academy's programme, whatever filter any other screen holds:
   * the group is every athlete. The programme gives the topics and today's
   * date; the timetable gives the rest.
   */
  private load(): void {
    this.calendar.set('loading');
    this.stats
      .syllabusCalendar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (calendar) => this.calendar.set(calendar),
        error: () => this.calendar.set('failed'),
      });
  }

  /** "12 ott". */
  private shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(y, m - 1, d));
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
