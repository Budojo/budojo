import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LanguageService } from '../../../core/services/language.service';
import { FeeTier } from '../../../core/services/fee-tier.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { FeeTierListComponent } from './fee-tier-list.component';

const URL = '/api/v1/academy/fee-tiers';

function tier(overrides: Partial<FeeTier> = {}): FeeTier {
  return {
    id: 1,
    label: '2 lezioni',
    amount_cents: 5500,
    lessons_per_week: 2,
    athletes_count: 0,
    ...overrides,
  };
}

describe('FeeTierListComponent', () => {
  let fixture: ComponentFixture<FeeTierListComponent>;
  let http: HttpTestingController;

  function render(tiers: FeeTier[]): void {
    fixture = TestBed.createComponent(FeeTierListComponent);
    fixture.detectChanges();
    http.expectOne(URL).flush({ data: tiers });
    fixture.detectChanges();
  }

  function query(selector: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FeeTierListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        // Provided by the host `<app-academy-form>` in the real page.
        MessageService,
        { provide: LanguageService, useValue: { currentLang: signal('en') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('tells an academy with no tiers that everyone is on the flat fee', () => {
    render([]);

    expect(query('[data-cy="fee-tier-empty"]')).not.toBeNull();
    expect(query('[data-cy="fee-tier-rows"]')).toBeNull();
  });

  it('lists each tier with its price', () => {
    render([tier(), tier({ id: 2, label: '3 lezioni', amount_cents: 6500, lessons_per_week: 3 })]);

    expect(query('[data-cy="fee-tier-row-1"]')?.textContent).toContain('2 lezioni');
    // Formatted as currency — the integer part is asserted so a locale
    // change doesn't churn this.
    expect(query('[data-cy="fee-tier-amount-1"]')?.textContent).toContain('55');
    expect(query('[data-cy="fee-tier-amount-2"]')?.textContent).toContain('65');
  });

  it('POSTs a new tier in cents and reloads the list', () => {
    render([]);

    fixture.componentInstance['startAdding']();
    fixture.componentInstance['form'].setValue({
      label: '  2 lezioni  ',
      amount: 55.5,
      lessons_per_week: 2,
    });
    fixture.componentInstance['submit']();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    // Euros in, cents out — and the label is trimmed rather than stored
    // with the whitespace the user happened to type.
    expect(req.request.body).toEqual({
      label: '2 lezioni',
      amount_cents: 5550,
      lessons_per_week: 2,
    });
    req.flush({ data: tier({ amount_cents: 5550 }) });

    http.expectOne(URL).flush({ data: [tier({ amount_cents: 5550 })] });
  });

  it('rounds a fractional cent up rather than dropping it', () => {
    render([]);

    fixture.componentInstance['startAdding']();
    fixture.componentInstance['form'].setValue({
      label: 'Terzi',
      amount: 55.555,
      lessons_per_week: 3,
    });
    fixture.componentInstance['submit']();

    expect(http.expectOne(URL).request.body.amount_cents).toBe(5556);
  });

  it('PATCHes an existing tier and pre-fills the form from it', () => {
    render([tier({ id: 9, label: '3 lezioni', amount_cents: 6500, lessons_per_week: 3 })]);

    fixture.componentInstance['startEditing'](
      tier({ id: 9, label: '3 lezioni', amount_cents: 6500, lessons_per_week: 3 }),
    );
    // Cents on the wire, euros in the field.
    expect(fixture.componentInstance['form'].value.amount).toBe(65);

    fixture.componentInstance['form'].patchValue({ amount: 70 });
    fixture.componentInstance['submit']();

    const req = http.expectOne(`${URL}/9`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.amount_cents).toBe(7000);
  });

  it('refuses to submit a tier with no name', () => {
    render([]);

    fixture.componentInstance['startAdding']();
    fixture.componentInstance['form'].setValue({
      label: '',
      amount: 55,
      lessons_per_week: 2,
    });
    fixture.componentInstance['submit']();

    http.expectNone(URL);
  });

  it('warns how many athletes a tier carries before deleting it', () => {
    render([tier({ id: 4, athletes_count: 3 })]);

    let asked = '';
    const confirm = fixture.debugElement.injector.get(ConfirmationService);
    confirm.confirm = (options) => {
      asked = String(options.message);
      options.accept?.();
      return confirm;
    };

    fixture.componentInstance['confirmRemove'](
      new MouseEvent('click'),
      tier({ id: 4, athletes_count: 3 }),
    );

    expect(asked).toContain('3');
    const req = http.expectOne(`${URL}/4`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    http.expectOne(URL).flush({ data: [] });
  });
});
