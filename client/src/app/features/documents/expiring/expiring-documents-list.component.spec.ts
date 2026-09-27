import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AthleteMissingMedicalCertificate,
  ExpiringDocument,
} from '../../../core/services/document.service';
import { ContactableAthlete } from '../../../core/services/athlete.service';
import { AcademyService } from '../../../core/services/academy.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ExpiringDocumentsListComponent } from './expiring-documents-list.component';

/** A person as the server sends them on this page (#1851), with the phone (#1931). */
function person(
  id: number,
  first: string,
  last: string,
  phone: { cc: string | null; nn: string | null } = { cc: '+39', nn: '3331234567' },
): ContactableAthlete {
  return {
    id,
    first_name: first,
    last_name: last,
    belt: 'blue',
    stripes: 1,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    phone_country_code: phone.cc,
    phone_national_number: phone.nn,
  };
}

/** The text a WhatsApp link carries, decoded. */
function messageOf(link: Element | null): string {
  const href = link?.getAttribute('href') ?? '';
  return decodeURIComponent(href.split('?text=')[1] ?? '');
}

function makeExpiring(overrides: Partial<ExpiringDocument> = {}): ExpiringDocument {
  return {
    id: 1,
    athlete_id: 42,
    type: 'medical_certificate',
    original_name: 'med.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    issued_at: '2025-01-01',
    expires_at: '2026-05-10',
    notes: null,
    created_at: '2026-04-20T10:00:00+00:00',
    deleted_at: null,
    athlete: person(42, 'Mario', 'Rossi'),
    ...overrides,
  };
}

describe('ExpiringDocumentsListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExpiringDocumentsListComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function mount(): ComponentFixture<ExpiringDocumentsListComponent> {
    const fixture = TestBed.createComponent(ExpiringDocumentsListComponent);
    fixture.detectChanges();
    return fixture;
  }

  function flushHealth(
    docs: ExpiringDocument[],
    missing: AthleteMissingMedicalCertificate[] = [],
  ): void {
    httpMock
      .expectOne('/api/v1/documents/expiring?days=30')
      .flush({ data: docs, missing_medical_certificate: missing });
  }

  it('fetches the documents-health envelope (days=30) on init', () => {
    mount();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/documents/expiring' && r.params.get('days') === '30',
    );
    req.flush({ data: [], missing_medical_certificate: [] });
  });

  it('renders rows with the athlete identity + deep-link to the athlete documents page', () => {
    const fixture = mount();
    flushHealth([
      makeExpiring({
        id: 1,
        athlete_id: 42,
        athlete: person(42, 'Mario', 'Rossi'),
      }),
      makeExpiring({
        id: 2,
        athlete_id: 7,
        athlete: person(7, 'Anna', 'Bianchi'),
        type: 'insurance',
      }),
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // Drawn as every list draws people (#1851): the belt spine, then the name,
    // which opens the athlete's documents.
    const links = el.querySelectorAll(
      '[data-cy="expiring-table"] [data-cy="athlete-name-link"]',
    ) as NodeListOf<HTMLAnchorElement>;
    expect(links).toHaveLength(2);
    expect(el.querySelectorAll('[data-cy="expiring-table"] [data-cy="belt-spine"]')).toHaveLength(
      2,
    );
    expect(links[0].textContent?.trim()).toBe('Mario Rossi');
    expect(links[0].getAttribute('href')).toBe('/dashboard/athletes/42/documents');
    expect(links[1].textContent?.trim()).toBe('Anna Bianchi');
    expect(links[1].getAttribute('href')).toBe('/dashboard/athletes/7/documents');
  });

  it('shows the empty-state block when no expiring documents AND no missing certs exist', () => {
    const fixture = mount();
    flushHealth([], []);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="all-clear-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="athlete-name-link"]')).toBeNull();
    expect(el.querySelector('[data-cy="missing-cert-section"]')).toBeNull();
  });

  it('shows the error block when the fetch fails and hides the table', () => {
    const fixture = mount();
    httpMock
      .expectOne('/api/v1/documents/expiring?days=30')
      .error(new ProgressEvent('err'), { status: 500, statusText: 'ISE' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="expiring-list-error"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="expiring-table"]')).toBeNull();
  });

  it('renders the missing-cert section when athletes without medical certs are returned', () => {
    const fixture = mount();
    flushHealth([], [person(11, 'Giulia', 'Rossi'), person(12, 'Luca', 'Verdi')]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const section = el.querySelector('[data-cy="missing-cert-section"]');
    expect(section).not.toBeNull();
    const rows = el.querySelectorAll(
      '[data-cy^="missing-cert-row-"]',
    ) as NodeListOf<HTMLAnchorElement>;
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Giulia Rossi');
    expect(rows[0].getAttribute('href')).toBe('/dashboard/athletes/11/documents');
    expect(rows[1].textContent).toContain('Luca Verdi');
    expect(rows[1].getAttribute('href')).toBe('/dashboard/athletes/12/documents');
    // The belt is on the row (#1851), and the row stays ONE link: the name
    // inside it is text, not a second anchor nested in the first.
    expect(rows[0].querySelector('[data-cy="belt-spine"]')).not.toBeNull();
    expect(rows[0].querySelector('a')).toBeNull();
  });

  it('hides the missing-cert section when no missing certs are returned', () => {
    const fixture = mount();
    flushHealth([makeExpiring({ id: 9 })], []);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="missing-cert-section"]'),
    ).toBeNull();
  });

  it('hides the expiring section when only missing certs exist (no expired documents)', () => {
    const fixture = mount();
    flushHealth([], [person(11, 'Giulia', 'Rossi')]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // Missing section is visible, but the expiring section block should be
    // entirely gone so the user isn't confused by an empty list under it.
    expect(el.querySelector('[data-cy="missing-cert-section"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="expiring-section"]')).toBeNull();
  });

  it('count phrasing uses singular when only one expiring document is returned', () => {
    const fixture = mount();
    flushHealth([makeExpiring({ id: 1 })], []);
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('[data-cy=page-header-count]');
    expect(countNode?.textContent).toContain('1 expiring');
  });

  it('count phrasing combines expiring + missing when both are present', () => {
    const fixture = mount();
    flushHealth(
      [makeExpiring({ id: 1 }), makeExpiring({ id: 2 }), makeExpiring({ id: 3 })],
      [person(11, 'Giulia', 'Rossi'), person(12, 'Luca', 'Verdi')],
    );
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('[data-cy=page-header-count]');
    expect(countNode?.textContent).toContain('3 expiring');
    expect(countNode?.textContent).toContain('2 no certificate');
  });

  it('renders BOTH sections simultaneously when expiring docs AND missing certs co-exist', () => {
    // Reviewer #892 — the count chip test confirms the phrasing but
    // doesn't guard against a template bug where one of the two
    // sections silently swaps to the wrong list. Pin the DOM:
    // when both inputs are non-empty, both [data-cy] anchors render
    // AND their row counts match the data.
    const fixture = mount();
    flushHealth(
      [
        makeExpiring({ id: 1, athlete_id: 42 }),
        makeExpiring({ id: 2, athlete_id: 43, type: 'insurance' }),
      ],
      [person(11, 'Giulia', 'Rossi'), person(12, 'Luca', 'Verdi'), person(13, 'Sara', 'Bianchi')],
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="missing-cert-section"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="expiring-section"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-cy^="missing-cert-row-"]')).toHaveLength(3);
    // The desktop table renders one <tr> per expiring doc in tbody.
    expect(el.querySelectorAll('[data-cy="expiring-table"] tbody tr')).toHaveLength(2);
    // All-clear empty block must NOT render when either axis has rows.
    expect(el.querySelector('[data-cy="all-clear-empty"]')).toBeNull();
  });
  describe("the academy's own papers (#1743)", () => {
    // They arrive in the same list with `athlete_id: null` and no `athlete`
    // object. The page used to read `doc.athlete.first_name` unguarded, so a
    // single academy document would have thrown during change detection and
    // blanked the whole screen.

    const policy = () =>
      makeExpiring({
        id: 7,
        athlete_id: null,
        academy_id: 1,
        type: 'insurance',
        original_name: 'polizza-rc.pdf',
        athlete: null,
      });

    it('renders the row instead of throwing on the missing athlete', () => {
      const fixture = mount();
      flushHealth([policy()]);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-cy="academy-owned"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="expiring-table"] tbody tr')).not.toBeNull();
    });

    it('offers no athlete deep-link, because there is nowhere to go', () => {
      const fixture = mount();
      flushHealth([policy()]);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      // A link to `/dashboard/athletes/null/documents` is a 404 dressed as a
      // control.
      expect(el.querySelector('[data-cy="athlete-name-link"]')).toBeNull();
    });

    it('still deep-links an athlete document beside it', () => {
      const fixture = mount();
      flushHealth([policy(), makeExpiring({ id: 8 })]);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      // The other half: refusing every link would pass the test above and
      // break the feature the page already had.
      expect(el.querySelector('[data-cy="athlete-name-link"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="academy-owned"]')).not.toBeNull();
    });

    it('names them in the header chip like any other row', () => {
      const fixture = mount();
      flushHealth([policy(), makeExpiring({ id: 8 })]);
      fixture.detectChanges();

      // The RENDERED count, not `count() === documents().length` — that
      // asserted a line this change never touched and could not have failed.
      const header = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(header).toContain('2');
      expect(fixture.componentInstance.count()).toBe(2);
    });
  });

  describe('the reminder on WhatsApp (#1931)', () => {
    beforeEach(() => {
      // "Runs out" or "ran out" is read against the owner's today.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 3, 20, 10, 0, 0));
      TestBed.inject(AcademyService).academy.set({
        name: 'Budojo BJJ Torino',
      } as never);
    });

    afterEach(() => vi.useRealTimers());

    it('offers every expiring row a reminder that says when the certificate runs out', () => {
      const fixture = mount();
      flushHealth([makeExpiring({ id: 1, athlete_id: 42, expires_at: '2026-05-10' })]);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const desktop = el.querySelector('[data-cy="expiring-contact-1-whatsapp"]');
      const card = el.querySelector('[data-cy="expiring-card-contact-1-whatsapp"]');

      expect(desktop?.getAttribute('href')).toContain('https://wa.me/393331234567?text=');
      expect(messageOf(desktop)).toContain('Mario');
      expect(messageOf(desktop)).toContain('medical certificate runs out on 10 May 2026');
      expect(messageOf(desktop)).toContain('Budojo BJJ Torino');
      // The same reminder on the phone's card.
      expect(messageOf(card)).toBe(messageOf(desktop));
    });

    it('says a certificate has run out when its date is past', () => {
      const fixture = mount();
      flushHealth([makeExpiring({ id: 3, expires_at: '2026-04-16' })]);
      fixture.detectChanges();

      const link = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-cy="expiring-contact-3-whatsapp"]',
      );
      expect(messageOf(link)).toContain('ran out on 16 April 2026');
    });

    it('never calls another paper a certificate', () => {
      const fixture = mount();
      flushHealth([makeExpiring({ id: 4, type: 'id_card', expires_at: '2026-05-10' })]);
      fixture.detectChanges();

      const message = messageOf(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-cy="expiring-contact-4-whatsapp"]',
        ),
      );
      expect(message).toContain('ID card');
      expect(message).not.toContain('medical certificate');
    });

    it('asks someone with no certificate at all for one', () => {
      const fixture = mount();
      flushHealth([], [person(11, 'Giulia', 'Rossi')]);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const link = el.querySelector('[data-cy="missing-cert-contact-11-whatsapp"]');
      expect(messageOf(link)).toContain("Giulia, I don't have your medical certificate yet");
      // Beside the row's link, never inside it: an anchor in an anchor is
      // invalid, and a tap on WhatsApp must not also open the athlete.
      expect(
        el.querySelector('[data-cy="missing-cert-row-11"] a[href^="https://wa.me"]'),
      ).toBeNull();
    });

    it('shows the disabled control, and says why, for someone with no number', () => {
      const fixture = mount();
      flushHealth([], [person(12, 'Luca', 'Verdi', { cc: null, nn: null })]);
      fixture.detectChanges();

      const none = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-cy="missing-cert-contact-12-none"]',
      );
      expect(none?.getAttribute('aria-label')).toBe('No phone number on file');
    });

    it("offers nothing on the academy's own papers, which belong to no one", () => {
      const fixture = mount();
      flushHealth([makeExpiring({ id: 9, athlete_id: null, athlete: null })]);
      fixture.detectChanges();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-cy^="expiring-contact-9"]'),
      ).toBeNull();
    });
  });
});
