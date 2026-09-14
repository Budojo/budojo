import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AthleteDetailComponent } from './athlete-detail.component';
import { Athlete } from '../../../core/services/athlete.service';

// PrimeNG's <p-tabs> binds a ResizeObserver in ngAfterViewInit; jsdom
// doesn't ship one. The component is exercised once data arrives, so
// stub the constructor with a no-op to keep CD past the second pass.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver ??=
  ResizeObserverStub;

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 42,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'mario@example.com',
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: '1990-05-15',
    belt: 'blue',
    stripes: 2,
    status: 'active',
    joined_at: '2023-01-10',
    created_at: '2026-04-22T10:00:00+00:00',
    ...overrides,
  };
}

function setupTestBed(
  idParam: string | null = '42',
  initialUrl = '/dashboard/athletes/42/documents',
  // `?from=` is how the section the edit form was opened from reaches both the
  // header button and the form's own Annulla / Salva (#1633).
  queryParams: Record<string, string> = {},
): { http: HttpTestingController; routerEvents: Subject<unknown> } {
  const paramMap = convertToParamMap(idParam ? { id: idParam } : {});
  const queryParamMap = convertToParamMap(queryParams);
  const routerEvents = new Subject<unknown>();
  TestBed.configureTestingModule({
    imports: [AthleteDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: Router,
        useValue: {
          navigate: vi.fn().mockResolvedValue(true),
          events: routerEvents.asObservable(),
          url: initialUrl,
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(paramMap),
          snapshot: { paramMap, queryParamMap },
          // The router builds the activated-route tree before it activates
          // components, so production always has a resolved child here. The
          // mock needs one too, or the component reads no tab segment and
          // falls back to Documents for every URL (#1600).
          firstChild: {
            snapshot: { url: [{ path: initialUrl.split('/').filter(Boolean).pop() ?? '' }] },
          },
        },
      },
      ...provideI18nTesting(),
      // The detail page now embeds <app-athlete-invitation-card> (#467),
      // whose constructor injects MessageService from the app-level
      // provider in production. The spec must mirror that root
      // provider — without it the child throws NG0201 at render time
      // and every detail spec that calls `detectChanges()` fails.
      MessageService,
    ],
  });
  return { http: TestBed.inject(HttpTestingController), routerEvents };
}

describe('AthleteDetailComponent', () => {
  it('loads the athlete and exposes the full name', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.athlete()?.first_name).toBe('Mario');
    expect(fixture.componentInstance.fullName()).toBe('Mario Rossi');
    httpMock.verify();
  });

  it('redirects to the list when the id is non-numeric', () => {
    const { http: httpMock } = setupTestBed('abc');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    // No GET should fire for a NaN id.
    httpMock.expectNone((r) => r.url.startsWith('/api/v1/athletes/'));

    const router = TestBed.inject(Router);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/athletes']);
    httpMock.verify();
  });

  it('maps status to the expected p-tag severity', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.statusSeverity('active')).toBe('success');
    expect(fixture.componentInstance.statusSeverity('inactive')).toBe('secondary');
    httpMock.verify();
  });

  it('exposes an error message when loading the athlete fails', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/athletes/42')
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.error()).toBe('Could not load this athlete.');
    httpMock.verify();
  });

  it('reads the active tab from the current URL', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/attendance');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.activeTab()).toBe('attendance');
    httpMock.verify();
  });

  // ─── Contact links (#162 frontend half) ──────────────────────────────────
  // The header renders the populated subset as icon chips that open in a
  // new tab. Empty channels collapse silently — when ALL three are empty
  // the entire chip list is omitted (no row of grey placeholders).

  it('renders only the populated contact-link chips with the right icon + href', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({
      data: makeAthlete({
        website: 'https://example.com',
        facebook: 'https://facebook.com/mario',
        // instagram intentionally omitted — should NOT render a chip.
      }),
    });
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.contact-links a');
    expect(chips.length).toBe(2);
    expect(chips[0].getAttribute('href')).toBe('https://example.com');
    expect(chips[0].getAttribute('target')).toBe('_blank');
    expect(chips[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(chips[0].querySelector('i')?.className).toContain('pi-globe');
    expect(chips[1].getAttribute('href')).toBe('https://facebook.com/mario');
    expect(chips[1].querySelector('i')?.className).toContain('pi-facebook');

    // Sanity: no Instagram chip rendered.
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-link-instagram"]')).toBeNull();
    httpMock.verify();
  });

  it('omits the contact-link list entirely when no channel is populated', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({
      data: makeAthlete({ website: null, facebook: null, instagram: null }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.contact-links')).toBeNull();
    httpMock.verify();
  });

  // ─── Self-row gates (#775) ───────────────────────────────────────────────
  // The owner-as-athlete row (`is_self: true`) excludes the invitation card,
  // the email-change card, and the payments tab — none of those surfaces
  // make sense on a self-row. A deep-link to `/payments` redirects to the
  // attendance tab so the page never renders a payments view that can
  // never have content.

  it('hides the payments tab on the owner self-row', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete({ is_self: true }) });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="athlete-tab-payments"]')).toBeNull();
    httpMock.verify();
  });

  it('hides the invitation and email-change cards on the owner self-row', () => {
    // From `/edit`, where the cards are rendered at all. Asserted from
    // `/documents` these two passed for the wrong reason: since #1500 the edit
    // gate hides both for EVERY row there, self or not, so `is_self` — the
    // thing the test is named after — was doing none of the work.
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete({ is_self: true }) });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-athlete-invitation-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-athlete-email-change-card')).toBeNull();
    // The photo card is not self-gated, so this proves the edit gate is open
    // and the two nulls above are about `is_self`.
    expect(fixture.nativeElement.querySelector('app-athlete-photo-card')).not.toBeNull();
    httpMock.verify();
  });

  it('still renders the three surfaces on a regular (non-self) row — under Edit', () => {
    // They used to sit above the tab strip on every tab, which pushed it to
    // y≈678 on a 1280×800 window: clicking Documents landed you where the
    // documents were off-screen (#1500). They live behind Edit now, with the
    // rest of the editable fields.
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-athlete-invitation-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-athlete-email-change-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-athlete-photo-card')).not.toBeNull();
    httpMock.verify();
  });

  it('shows the payments tab on a regular row, on a section route', () => {
    // Was asserted from `/edit` until #1633 took the strip off that route.
    // The claim it was making is about `is_self`, not about editing, so it
    // moved to a route where a strip exists at all.
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/documents');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="athlete-tab-payments"]')).not.toBeNull();
    httpMock.verify();
  });

  it('keeps the account cards out of the way on every other tab (#1500)', () => {
    // The point of the move: what you navigated to is what you see.
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/documents');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-athlete-invitation-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-athlete-email-change-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-athlete-photo-card')).toBeNull();

    // The tab strip and the athlete's identity are still there — this moved
    // the cards, it did not hide the page.
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-tabs"]')).not.toBeNull();
    httpMock.verify();
  });

  it('redirects a self-row deep-link from /payments to the attendance tab', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/payments');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete({ is_self: true }) });
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    expect(router.navigate).toHaveBeenCalledWith(
      ['attendance'],
      expect.objectContaining({ replaceUrl: true }),
    );
    httpMock.verify();
  });

  it('does NOT redirect from /payments when the row is not a self-row', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/payments');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    expect(router.navigate).not.toHaveBeenCalledWith(['attendance'], expect.anything());
    httpMock.verify();
  });
});

describe('AthleteDetailComponent — the tab strip follows the URL', () => {
  it.each([
    ['documents'],
    ['attendance'],
    ['payments'],
    // Missing since it shipped: the strip underlined Documents while the
    // promotion history was on screen.
    ['promotions'],
    ['coverage'],
  ])('underlines the %s tab when the URL is on it', (tab) => {
    const { http: httpMock } = setupTestBed('42', `/dashboard/athletes/42/${tab}`);
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.activeTab()).toBe(tab);
    httpMock.verify();
  });

  // `edit` is no longer one of them (#1633), but it must still RESOLVE — it is
  // what gates the photo, account and email cards. Dropping it from the
  // component's list would underline Documenti over the edit form and make
  // those three cards disappear, with every other test still green.
  it('still resolves the edit route, though it is no longer a tab', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });

    expect(fixture.componentInstance.activeTab()).toBe('edit');
    httpMock.verify();
  });
  // #1634 — the edit tab's reading order.
  it('puts the photo and the email before the form, not after the delete button', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const photo = root.querySelector('app-athlete-photo-card');
    const email = root.querySelector('app-athlete-email-change-card');
    const outlet = root.querySelector('router-outlet');
    expect(photo).not.toBeNull();
    expect(outlet).not.toBeNull();

    // The form — and the red "Elimina atleta" at the end of it — render into
    // the outlet. Anything after that button reads as an afterthought, which
    // is where the photo and the email used to be.
    const before = (el: Element | null): boolean =>
      el !== null &&
      Boolean(el.compareDocumentPosition(outlet!) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(photo)).toBe(true);
    expect(before(email)).toBe(true);
    httpMock.verify();
  });
});

// ─── The header carries the action, and a way to reach the athlete (#1633) ──

describe('AthleteDetailComponent — editing is a mode, not a section', () => {
  it('leaves five content sections in the strip, Documenti first, and no Modifica', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/documents');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="athlete-tab-edit"]')).toBeNull();

    const tabs = [...root.querySelectorAll('p-tab')].map((t) => t.getAttribute('data-cy'));
    expect(tabs).toEqual([
      'athlete-tab-documents',
      'athlete-tab-attendance',
      'athlete-tab-payments',
      'athlete-tab-coverage',
      'athlete-tab-promotions',
    ]);
    httpMock.verify();
  });

  it('takes the whole strip off screen while the form is open, and offers the way out', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // Not "no tab underlined" — no strip. A PrimeNG tablist whose value
    // matches no tab puts tabindex="-1" on every one of them, which takes the
    // whole strip out of the keyboard order.
    expect(root.querySelector('[data-cy="athlete-tabs"]')).toBeNull();
    expect(root.querySelector('[data-cy="athlete-edit-cta"]')).toBeNull();
    expect(root.querySelector('[data-cy="athlete-edit-close"]')).not.toBeNull();
    httpMock.verify();
  });

  it('shows the strip and the Modifica action on a section route', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/documents');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="athlete-tabs"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="athlete-edit-cta"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="athlete-edit-close"]')).toBeNull();
    httpMock.verify();
  });

  it('tells the form which section it was opened from, tracking in-session moves', () => {
    // Starts on Documenti and reaches Pagamenti the way a user does, through a
    // navigation, so this covers the router-event path and not just the
    // cold-load seed. Putting `activeTab.set` back in place of `setTab` in the
    // subscription turns this red; starting the test on Pagamenti would not,
    // because the seed writes the section either way.
    const { http: httpMock, routerEvents } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.activeTab()).toBe('documents');

    // The router is a stub, so stand in for the navigation it would report.
    routerEvents.next(
      new NavigationEnd(1, '/dashboard/athletes/42/payments', '/dashboard/athletes/42/payments'),
    );
    fixture.detectChanges();
    expect(component.activeTab()).toBe('payments');

    component['toggleEdit']();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['edit'],
      expect.objectContaining({ queryParams: { from: 'payments' } }),
    );
    httpMock.verify();
  });

  it('closes back to the section named in the URL, not to Documenti', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit', {
      from: 'payments',
    });
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    fixture.componentInstance['toggleEdit']();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['payments'], expect.anything());
    httpMock.verify();
  });

  it('keeps one button across the mode switch, so the press does not lose focus', () => {
    // Two buttons in an @if/@else are two embedded views: pressing one destroys
    // the focused element and focus falls back to <body>. One button whose
    // label and icon change keeps the node, and the focus on it.
    const { http: httpMock, routerEvents } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const before = root.querySelector('.athlete-detail-page__actions button');
    expect(before).not.toBeNull();

    routerEvents.next(
      new NavigationEnd(1, '/dashboard/athletes/42/edit', '/dashboard/athletes/42/edit'),
    );
    fixture.detectChanges();

    expect(root.querySelector('.athlete-detail-page__actions button')).toBe(before);
    expect(root.querySelector('[data-cy="athlete-edit-close"]')).not.toBeNull();
    httpMock.verify();
  });

  it('falls back to Documenti for a deep link that lands straight on the form', () => {
    const { http: httpMock } = setupTestBed('42', '/dashboard/athletes/42/edit');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    fixture.componentInstance['toggleEdit']();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['documents'], expect.anything());
    httpMock.verify();
  });
});

describe('AthleteDetailComponent — the header says how to reach the athlete', () => {
  it('writes the phone and the email out, as tel: and mailto:', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({
      data: makeAthlete({
        phone_country_code: '+39',
        phone_national_number: '3331234567',
        email: 'giulia@example.com',
      }),
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const phone = root.querySelector('[data-cy="athlete-reach-phone"]');
    const email = root.querySelector('[data-cy="athlete-reach-email"]');

    // The href cannot carry the space; the label is what a person reads.
    expect(phone?.getAttribute('href')).toBe('tel:+393331234567');
    expect(phone?.textContent?.trim()).toBe('+39 3331234567');
    expect(email?.getAttribute('href')).toBe('mailto:giulia@example.com');
    expect(email?.textContent?.trim()).toBe('giulia@example.com');

    // A new tab for a tel: or mailto: leaves an empty window behind.
    expect(phone?.getAttribute('target')).toBeNull();
    expect(email?.getAttribute('target')).toBeNull();
    httpMock.verify();
  });

  it('says nothing about a phone when only half the pair is stored', () => {
    const { http: httpMock } = setupTestBed('42');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({
      data: makeAthlete({ phone_country_code: '+39', phone_national_number: null, email: null }),
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="athlete-reach-phone"]')).toBeNull();
    expect(root.querySelector('.reach-links')).toBeNull();
    httpMock.verify();
  });

  it('names the athlete without agreeing with their gender, in Italian', () => {
    const { http: httpMock } = setupTestBed('42');
    TestBed.inject(TranslateService).use('it');
    const fixture = TestBed.createComponent(AthleteDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/athletes/42').flush({ data: makeAthlete() });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const meta = root.querySelector('.athlete-detail-page__meta')?.textContent?.trim() ?? '';
    // Not `p-tag` — the age badge is one too, and it comes first.
    const status = root.querySelector('[data-cy="athlete-status"]')?.textContent?.trim() ?? '';

    // "Iscritto il" and "Attivo" both agree with a masculine subject, under
    // the name of an athlete who may not be one. Neither replacement agrees
    // with anything.
    expect(meta).toContain('Dal ');
    expect(meta).not.toContain('Iscritto');
    expect(status).toBe('In attività');
    httpMock.verify();
  });
});
