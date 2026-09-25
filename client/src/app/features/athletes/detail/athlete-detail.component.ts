import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { Athlete, AthleteService, AthleteStatus } from '../../../core/services/athlete.service';
import { RuntimeService } from '../../../core/services/runtime.service';
import { LanguageService } from '../../../core/services/language.service';
import { formatIsoDate } from '../../../shared/utils/locale';
import { contactLinks, phoneLabel } from '../../../shared/utils/contact-links';
import { relativeDay } from '../../../shared/utils/relative-day';
import { Tooltip } from 'primeng/tooltip';
import { AgeBadgeComponent } from '../../../shared/components/age-badge/age-badge.component';
import { BeltBadgeComponent } from '../../../shared/components/belt-badge/belt-badge.component';
import { STATUS_KEYS } from '../../../shared/utils/i18n-enum-keys';
import { InvitationCardComponent } from './invitation-card/invitation-card.component';
import { EmailChangeCardComponent } from './email-change-card/email-change-card.component';
import { AthletePhotoCardComponent } from '../photo-card/athlete-photo-card.component';
import { returnSection } from '../athlete-return-section';

/** One labelled way to reach the athlete, in the header (#1633, #1727). */
interface ReachLink {
  icon: string;
  href: string;
  /** What the chip shows: the number, the address, or "WhatsApp". */
  label: string;
  ariaKey: string;
  /** What the aria-label names — the number for both phone links. */
  ariaValue: string;
  cyKey: string;
  /** A web page (WhatsApp) opens in a new tab; `tel:` and `mailto:` never do. */
  external: boolean;
}

@Component({
  selector: 'app-athlete-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    RouterOutlet,
    RouterLink,
    ButtonModule,
    TabsModule,
    TagModule,
    Tooltip,
    AgeBadgeComponent,
    BeltBadgeComponent,
    InvitationCardComponent,
    EmailChangeCardComponent,
    AthletePhotoCardComponent,
  ],
  templateUrl: './athlete-detail.component.html',
  styleUrl: './athlete-detail.component.scss',
})
export class AthleteDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly athleteService = inject(AthleteService);
  protected readonly runtime = inject(RuntimeService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly languageService = inject(LanguageService);

  /**
   * The joining date, as a person reads it (#1498).
   *
   * The template interpolated `a.joined_at` straight into the label, so the
   * line under an athlete's name read `Joined 2024-09-01`. An ISO date is a
   * wire format; nobody reads one as a date.
   *
   * Reading `currentLang()` inside makes this re-evaluate when the sidebar
   * toggle flips, which is the whole point — before this, switching to
   * Italian changed every word on the page and not one date.
   */
  protected joinedOn(iso: string): string {
    return formatIsoDate(iso, this.languageService.currentLang());
  }

  /**
   * "Last trained 3 days ago", or "No sessions yet" (#1726). A distance,
   * because that is what an owner acts on; the day itself is the tooltip.
   */
  protected lastSeen(athlete: Athlete): string {
    this.languageService.currentLang(); // signal dep — re-translate on toggle
    const iso = athlete.last_attended_on;
    return iso
      ? this.translate.instant('athletes.detail.lastSeen', {
          when: relativeDay(iso, this.translate),
        })
      : this.translate.instant('athletes.detail.lastSeenNever');
  }

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly athlete = signal<Athlete | null>(null);
  readonly activeTab = signal<string>('documents');

  /**
   * Editing is a mode, not a section (#1633).
   *
   * It used to be the first tab, ahead of Documenti, in a strip whose other
   * five entries all answer "what do I want to see". Editing answers "what do
   * I want to do", so it left the strip for a button in the header — and while
   * it is open the strip is not rendered at all.
   *
   * That last part is not cosmetic. PrimeNG accepts a `[value]` matching no
   * rendered tab without a word of complaint, and then every tab computes
   * `active === false`, which drives `tabindex` to `-1` on all of them: the
   * whole tablist drops out of the keyboard order, the ink bar is positioned
   * from an undefined offset, and every tab reports `aria-selected="false"`.
   * A strip nobody can reach by keyboard is worse than no strip, so the
   * header carries the way out instead.
   */
  readonly isEditing = computed(() => this.activeTab() === 'edit');

  /**
   * The section to come back to when editing closes.
   *
   * Sending everyone to Documenti would strand the owner who opened the form
   * from Pagamenti — they would have to find their way back to a tab they
   * never left on purpose. Documenti is only the cold-start fallback, for a
   * deep link that arrives straight on `/edit` with no section behind it.
   */
  private readonly lastSection = signal<string>('documents');

  readonly fullName = computed(() => {
    const a = this.athlete();
    return a ? `${a.first_name} ${a.last_name}` : '';
  });

  /**
   * Contact links (#162) — same shape as the academy detail page. Emits
   * only the populated channels so the header row can collapse when
   * they're all empty (no grey-icon noise for a roster of athletes who
   * haven't shared their socials). Returns an empty array when none
   * are filled; the template guards on `links.length > 0`.
   *
   * URLs are passed through verbatim — the form-layer validator
   * restricts input to http/https, so the SPA doesn't sanitize again.
   */
  readonly contactLinks = computed<
    { icon: string; url: string; labelKey: string; cyKey: string }[]
  >(() => {
    const a = this.athlete();
    if (!a) return [];
    const links: { icon: string; url: string; labelKey: string; cyKey: string }[] = [];
    if (a.website)
      links.push({
        icon: 'pi pi-globe',
        url: a.website,
        labelKey: 'athletes.detail.contactLinks.website',
        cyKey: 'website',
      });
    if (a.facebook)
      links.push({
        icon: 'pi pi-facebook',
        url: a.facebook,
        labelKey: 'athletes.detail.contactLinks.facebook',
        cyKey: 'facebook',
      });
    if (a.instagram)
      links.push({
        icon: 'pi pi-instagram',
        url: a.instagram,
        labelKey: 'athletes.detail.contactLinks.instagram',
        cyKey: 'instagram',
      });
    return links;
  });

  /**
   * Phone and email, as links you can press (#1633, DET-2).
   *
   * The header listed an Instagram icon and nothing else, on the one screen a
   * coach opens in order to reach somebody — both values were in the payload
   * the whole time, and the only place an owner could read the email was
   * behind the edit route.
   *
   * These are labelled rather than icon chips, deliberately. A number is as
   * often copied or read aloud as dialled, and an icon hides the value it
   * stands for. They also do not take `target="_blank"`: `tel:` and `mailto:`
   * are handed to the operating system, and a blank tab for them opens an
   * empty window on the desktop.
   *
   * The hrefs come from `contactLinks()` (#1727), shared with every list
   * that names an athlete; the visible label keeps the prefix apart from the
   * digits so it can be read. WhatsApp (#1727) sits beside the number, since
   * that is how this owner actually reaches people. It is the one link here
   * that is a web page, so it alone opens in a new tab.
   */
  readonly reachLinks = computed<ReachLink[]>(() => {
    this.languageService.currentLang(); // signal dep — the WhatsApp label is translated
    const a = this.athlete();
    if (!a) return [];
    const reach: ReachLink[] = [];
    const { tel, whatsapp } = contactLinks(a.phone_country_code, a.phone_national_number);
    const number = phoneLabel(a.phone_country_code, a.phone_national_number);
    if (tel && whatsapp && number) {
      reach.push({
        icon: 'pi pi-phone',
        href: tel,
        label: number,
        ariaKey: 'athletes.detail.reach.phone',
        ariaValue: number,
        cyKey: 'phone',
        external: false,
      });
      reach.push({
        icon: 'pi pi-whatsapp',
        href: whatsapp,
        label: this.translate.instant('shared.contact.whatsapp'),
        ariaKey: 'athletes.detail.reach.whatsapp',
        ariaValue: number,
        cyKey: 'whatsapp',
        external: true,
      });
    }
    if (a.email)
      reach.push({
        icon: 'pi pi-envelope',
        href: `mailto:${a.email}`,
        label: a.email,
        ariaKey: 'athletes.detail.reach.email',
        ariaValue: a.email,
        cyKey: 'email',
        external: false,
      });
    return reach;
  });

  /** One button, one handler — see the template for why it is not two. */
  protected toggleEdit(): void {
    if (this.isEditing()) {
      this.leaveEdit();
    } else {
      this.enterEdit();
    }
  }

  /**
   * Open the edit form, saying in the URL where it was opened from.
   *
   * A navigation rather than a link, so the button is one tab stop:
   * `routerLink` on a `p-button` writes `tabindex` onto the host while the
   * inner `<button>` stays focusable, which is two stops for one control.
   *
   * The section rides in a query param rather than only in `lastSection`,
   * because this component is not the only way out of the form. `Annulla`
   * and `Salva modifiche` at the bottom of the form navigate on their own,
   * and they cannot read a signal in here — but they can read the URL they
   * were opened with. A signal would also be gone after a reload; the param
   * is not.
   */
  private enterEdit(): void {
    void this.router.navigate(['edit'], {
      relativeTo: this.route,
      queryParams: { from: this.lastSection() },
    });
  }

  /** Close the edit form, back to whichever section it was opened from. */
  private leaveEdit(): void {
    void this.router.navigate([returnSection(this.route.snapshot.queryParamMap.get('from'))], {
      relativeTo: this.route,
    });
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) return;
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        void this.router.navigate(['/dashboard/athletes']);
        return;
      }
      this.loadAthlete(id);
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.setTab(this.tabFromUrl(e.urlAfterRedirects)));

    // The child route, not `router.url`. On a cold load the component is built
    // while the initial navigation is still resolving, so `router.url` is
    // still the previous one — `/` — and the first render puts the tab strip
    // on the Documents fallback. The NavigationEnd above then corrects the
    // signal, but PrimeNG has already measured and placed its underline, and
    // it does not come back for it (#1600). The activated-route tree is built
    // before components activate, so this is right the first time.
    this.setTab(this.tabFromChildRoute());
  }

  /**
   * Move the strip, and remember the section while doing it.
   *
   * Both callers go through here so the two entry points — the cold-load seed
   * and every later navigation — cannot drift apart on what "the section I
   * came from" means.
   */
  private setTab(tab: string): void {
    if (tab !== 'edit') {
      this.lastSection.set(tab);
    }
    this.activeTab.set(tab);
  }

  /** The tab segment the router has already resolved for this page. */
  private tabFromChildRoute(): string {
    const path = this.route.firstChild?.snapshot.url[0]?.path;

    return path !== undefined && path !== '' ? this.tabFromUrl(`/${path}`) : 'documents';
  }

  /**
   * Which tab the URL is on. Documents is the fallback because it is the
   * default child route.
   *
   * A list rather than a chain of ifs, so adding a child route and forgetting
   * this is harder: `promotions` had been missing since it shipped, and the
   * tab strip quietly underlined Documents while showing the promotion
   * history. `coverage` (#1567) would have landed the same way.
   */
  private tabFromUrl(url: string): string {
    // `edit` stays in this list even though it is no longer a tab (#1633). It
    // is the flag the photo, account and email cards are keyed on, and the
    // thing that hides the strip while the form is open. Drop it and the URL
    // resolves to `documents`: Documenti gets underlined over the edit form,
    // and those three cards silently stop rendering.
    const tabs = ['payments', 'attendance', 'promotions', 'coverage', 'edit'];

    return tabs.find((tab) => url.includes(`/${tab}`)) ?? 'documents';
  }

  statusSeverity(status: AthleteStatus): 'success' | 'secondary' {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'secondary';
    }
  }

  statusLabelKey(status: AthleteStatus): string {
    return STATUS_KEYS[status];
  }

  /**
   * Refetch the athlete envelope. Public so child cards (e.g. the
   * email-change card after a state-A direct edit or a state-B invite
   * swap) can ask the parent to re-pull the row so the header email
   * + invitation summary stay in lock-step with the server.
   */
  /**
   * Swap in a row a child already has, instead of refetching it.
   *
   * `reloadAthlete()` exists for children that only report *that* something
   * changed; the photo card hands back the updated athlete, and going back to
   * the server for a row we are holding would be a round-trip to learn what we
   * were just told.
   */
  onAthleteChanged(updated: Athlete): void {
    // The photo endpoints do not select the last presence (#1726) and leave
    // the key out; keep the one we already hold rather than dropping the line.
    const held = this.athlete()?.last_attended_on;
    this.athlete.set(
      updated.last_attended_on === undefined ? { ...updated, last_attended_on: held } : updated,
    );
  }

  reloadAthlete(): void {
    const a = this.athlete();
    if (a) this.loadAthlete(a.id);
  }

  private loadAthlete(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.athleteService
      .get(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (a) => {
          this.athlete.set(a);
          this.maybeRedirectSelfFromPayments(a);
        },
        error: () => this.error.set(this.translate.instant('athletes.detail.loadError')),
      });
  }

  /**
   * Self-rows are excluded from the payments pipeline by design (#775),
   * so the template hides the payments tab on `is_self: true`. A direct
   * deep-link to `/dashboard/athletes/{self-id}/payments` still resolves
   * the child route though — without this redirect the page renders a
   * payments view that can never have content. We send the user to the
   * attendance tab (next most likely intent on a self-row) and replace
   * the URL so back-button doesn't bounce them right back here.
   */
  private maybeRedirectSelfFromPayments(a: Athlete): void {
    if (a.is_self && this.activeTab() === 'payments') {
      void this.router.navigate(['attendance'], {
        relativeTo: this.route,
        replaceUrl: true,
      });
    }
  }
}
