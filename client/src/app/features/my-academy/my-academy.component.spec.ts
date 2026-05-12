import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyAcademyComponent } from './my-academy.component';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import type { MeAcademy } from '../../core/services/academy.service';

function fixtureAcademy(overrides: Partial<MeAcademy> = {}): MeAcademy {
  return {
    id: 1,
    name: 'Budojo Roma',
    slug: 'budojo-roma',
    phone_country_code: '+39',
    phone_national_number: '0612345678',
    website: 'https://budojo.example',
    facebook: null,
    instagram: null,
    address: {
      line1: 'Via Roma 10',
      line2: null,
      city: 'Roma',
      postal_code: '00100',
      province: 'RM',
      country: 'IT',
    },
    logo_url: null,
    training_days: null,
    owner: {
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'mario@example.com',
    },
    ...overrides,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [MyAcademyComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MyAcademyComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

describe('MyAcademyComponent (#618, M7 PR-D slice 2)', () => {
  it('renders the loading skeleton while the request is in flight', () => {
    const { el, http } = setup();
    expect(el.querySelector('[data-cy="my-academy-loading"]')).not.toBeNull();
    http.expectOne(`${environment.apiBase}/api/v1/me/academy`).flush({ data: fixtureAcademy() });
  });

  it('renders the academy name, address, phone, and owner contact when populated', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/academy`).flush({ data: fixtureAcademy() });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-academy-card"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-academy-name"]')?.textContent).toContain('Budojo Roma');
    expect(el.querySelector('[data-cy="my-academy-address"]')?.textContent).toContain(
      'Via Roma 10',
    );
    expect(el.querySelector('[data-cy="my-academy-phone"]')?.textContent).toContain('+39');
    expect(el.querySelector('[data-cy="my-academy-owner"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-academy-owner-email"]')?.textContent).toContain(
      'mario@example.com',
    );
  });

  it('renders the empty state when the API returns null (no linked academy)', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/academy`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-academy-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-academy-card"]')).toBeNull();
  });

  it('renders the error state on a 500', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/academy`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-academy-error"]')).not.toBeNull();
  });

  it('hides the address row when no address is on file', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/academy`)
      .flush({ data: fixtureAcademy({ address: null }) });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-academy-card"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-academy-address"]')).toBeNull();
  });
});
