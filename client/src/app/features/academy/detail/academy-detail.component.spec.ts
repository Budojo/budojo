import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterLink, provideRouter } from '@angular/router';
import { AcademyDetailComponent } from './academy-detail.component';
import { Academy, AcademyService } from '../../../core/services/academy.service';

function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 1,
    name: 'Gracie Barra Torino',
    slug: 'gracie-barra-torino-a1b2c3d4',
    address: {
      line1: 'Via Roma 1',
      line2: null,
      city: 'Torino',
      postal_code: '10100',
      province: 'TO',
      country: 'IT',
    },
    logo_url: null,
    ...overrides,
  };
}

function setupTestBed() {
  TestBed.configureTestingModule({
    imports: [AcademyDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
}

describe('AcademyDetailComponent', () => {
  it('renders the cached academy name, slug, and address from the service signal', () => {
    setupTestBed();
    const service = TestBed.inject(AcademyService);
    service.academy.set(makeAcademy());

    const fixture = TestBed.createComponent(AcademyDetailComponent);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-cy="academy-name"]')?.textContent).toContain(
      'Gracie Barra Torino',
    );
    expect(html.querySelector('[data-cy="academy-row-slug"]')?.textContent).toContain(
      'gracie-barra-torino-a1b2c3d4',
    );
    const addressText = (
      html.querySelector('[data-cy="academy-row-address"]')?.textContent ?? ''
    ).replace(/\s+/g, ' ');
    expect(addressText).toContain('Via Roma 1');
    expect(addressText).toContain('10100 Torino (TO)');
  });

  it('renders only the populated parts of a legacy/incomplete address (#72)', () => {
    // Legacy backfill from the pre-#72 freeform column populates only `line1`,
    // leaving city/postal_code/province as null. The detail page must skip
    // the null parts instead of rendering "null null (null)" gibberish.
    setupTestBed();
    TestBed.inject(AcademyService).academy.set(
      makeAcademy({
        address: {
          line1: 'Via Piana, 1, 06061 Castiglione del Lago PG',
          line2: null,
          city: null,
          postal_code: null,
          province: null,
          country: 'IT',
        },
      }),
    );

    const fixture = TestBed.createComponent(AcademyDetailComponent);
    fixture.detectChanges();

    const addressText = (
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="academy-row-address"]')
        ?.textContent ?? ''
    ).replace(/\s+/g, ' ');
    expect(addressText).toContain('Via Piana, 1, 06061 Castiglione del Lago PG');
    expect(addressText).not.toContain('null');
    expect(addressText).not.toContain('()');
  });

  it('renders an em-dash placeholder for a null address so the row still anchors visually', () => {
    // Empty state matters: the card should still have three rows with a
    // clear "nothing here yet" cue, not a sparse two-row card that reads
    // "did I forget to fill something in?". Norman's feedback rule —
    // show the absence explicitly.
    setupTestBed();
    TestBed.inject(AcademyService).academy.set(makeAcademy({ address: null }));

    const fixture = TestBed.createComponent(AcademyDetailComponent);
    fixture.detectChanges();

    const addressRow = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="academy-row-address"]',
    );
    expect(addressRow?.textContent?.trim()).toBe('—');
  });

  it('wires the Edit button to /dashboard/academy/edit via routerLink', () => {
    setupTestBed();
    TestBed.inject(AcademyService).academy.set(makeAcademy());

    const fixture = TestBed.createComponent(AcademyDetailComponent);
    fixture.detectChanges();

    // Assert on the RouterLink directive's resolved urlTree — the most
    // stable surface across Angular router versions. The raw `routerLink`
    // input is normalized into a `commands` array internally, so
    // stringifying the urlTree is the only version-independent readback.
    const routerLinks = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map((el) => el.injector.get(RouterLink));
    const editTargets = routerLinks.map((rl) => rl.urlTree?.toString() ?? '');
    expect(editTargets).toContain('/dashboard/academy/edit');
  });

  it('renders em-dash fallbacks when the academy signal is null — avoids NPEs during the first-tick flash', () => {
    setupTestBed();
    // Do NOT set the signal — simulate the first render tick before the
    // guard has resolved.
    const fixture = TestBed.createComponent(AcademyDetailComponent);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-cy="academy-name"]')?.textContent?.trim()).toBe('—');
    expect(html.querySelector('[data-cy="academy-row-slug"]')?.textContent?.trim()).toBe('—');
  });

  // ─── Phone row (#161 follow-up) ────────────────────────────────────────────
  // Phone is set on the edit form but was missing from the read-only detail
  // page. The pair is all-or-nothing on the wire; render a tappable
  // `tel:` link when both halves are present, an em-dash otherwise.

  it('renders the phone pair as a tel: link when both fields are populated', () => {
    setupTestBed();
    TestBed.inject(AcademyService).academy.set(
      makeAcademy({ phone_country_code: '+39', phone_national_number: '3331234567' }),
    );

    const fixture = TestBed.createComponent(AcademyDetailComponent);
    fixture.detectChanges();

    const cell = fixture.nativeElement.querySelector(
      '[data-cy="academy-row-phone"]',
    ) as HTMLElement;
    const link = cell.querySelector('a') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    // Visible label uses a space between the prefix and the digits.
    expect(link!.textContent?.trim()).toBe('+39 3331234567');
    // `tel:` href cannot tolerate inner whitespace — must be the unspaced
    // E.164 form so iOS / Android dialer parses it cleanly.
    expect(link!.getAttribute('href')).toBe('tel:+393331234567');
  });

  // Partial-data defence: the all-or-nothing validator on the wire keeps
  // half-filled pairs from being saved on new rows, but legacy rows or
  // schema migrations can land with one half null and the other set.
  // The em-dash fallback must trigger in every "incomplete" shape, not
  // just both-null — covering all three keeps the contract honest.
  it.each([
    { phone_country_code: null, phone_national_number: null },
    { phone_country_code: '+39', phone_national_number: null },
    { phone_country_code: null, phone_national_number: '3331234567' },
  ])(
    'renders an em-dash when the phone pair is partial (cc=$phone_country_code, nn=$phone_national_number)',
    (overrides) => {
      setupTestBed();
      TestBed.inject(AcademyService).academy.set(makeAcademy(overrides));

      const fixture = TestBed.createComponent(AcademyDetailComponent);
      fixture.detectChanges();

      const cell = fixture.nativeElement.querySelector(
        '[data-cy="academy-row-phone"]',
      ) as HTMLElement;
      expect(cell.querySelector('a')).toBeNull();
      expect(cell.textContent?.trim()).toBe('—');
    },
  );
});
