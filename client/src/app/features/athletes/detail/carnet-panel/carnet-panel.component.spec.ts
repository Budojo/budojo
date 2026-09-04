import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { AcademyService } from '../../../../core/services/academy.service';
import { Carnet, CarnetEntry, CarnetService } from '../../../../core/services/carnet.service';
import { CarnetPanelComponent } from './carnet-panel.component';

function carnet(overrides: Partial<Carnet> = {}): Carnet {
  return {
    id: 1,
    code: 'A7K2',
    athlete_id: 42,
    total_entries: 10,
    remaining_entries: 7,
    price_cents: 7000,
    purchased_at: '2026-01-10',
    expires_at: '2027-01-10',
    is_active: true,
    ...overrides,
  };
}

class FakeCarnetService {
  // Not readonly: individual tests swap these to drive error and empty paths.
  list = vi.fn(() => of([carnet()]));
  sell = vi.fn(() => of(carnet()));
  entries = vi.fn(() => of([] as CarnetEntry[]));
}

const ACADEMY_BASE = {
  id: 1,
  name: 'Test',
  slug: 'test',
  address: null,
  logo_url: null,
} as const;

function setup(
  opts: {
    priceCents?: number | null;
    entriesPerCarnet?: number | null;
    carnets?: Carnet[];
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [CarnetPanelComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      MessageService,
      { provide: CarnetService, useClass: FakeCarnetService },
      ...provideI18nTesting(),
    ],
  });

  TestBed.inject(AcademyService).academy.set({
    ...ACADEMY_BASE,
    carnet_price_cents: opts.priceCents === undefined ? 7000 : opts.priceCents,
    carnet_entries: opts.entriesPerCarnet === undefined ? 10 : opts.entriesPerCarnet,
  });

  const service = TestBed.inject(CarnetService) as unknown as FakeCarnetService;
  if (opts.carnets) service.list = vi.fn(() => of(opts.carnets!));

  const fixture = TestBed.createComponent(CarnetPanelComponent);
  fixture.componentRef.setInput('athleteId', 42);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service };
}

function text(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent ?? '';
}

describe('CarnetPanelComponent', () => {
  it('renders nothing when the academy does not sell carnets', () => {
    const { fixture, service } = setup({ priceCents: null });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-panel"]')).toBeNull();
    // No point asking the server for carnets the academy can't sell — but the
    // panel loading anyway would be harmless, so this only pins the render.
    expect(service.list).toHaveBeenCalled();
  });

  it('renders nothing when only half the offering is configured', () => {
    const { fixture } = setup({ entriesPerCarnet: null });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-panel"]')).toBeNull();
  });

  it('shows the balance card with code and remaining entries', () => {
    const { fixture } = setup();

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-balance-card"]')).not.toBeNull();
    expect(text(fixture)).toContain('A7K2');
    expect(
      fixture.nativeElement.querySelector('[data-cy="carnet-remaining"]').textContent.trim(),
    ).toBe('7');
  });

  it('shows the empty state when no carnet is active', () => {
    const { fixture } = setup({ carnets: [carnet({ is_active: false, remaining_entries: 0 })] });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-balance-card"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="carnet-empty"]')).not.toBeNull();
  });

  it('flags a low balance so the owner can offer a renewal', () => {
    const { fixture } = setup({ carnets: [carnet({ remaining_entries: 2 })] });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-low-balance"]')).not.toBeNull();
  });

  it('does not flag a healthy balance', () => {
    const { fixture } = setup({ carnets: [carnet({ remaining_entries: 3 })] });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-low-balance"]')).toBeNull();
  });

  it('flags a carnet expiring within thirty days', () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const { fixture } = setup({ carnets: [carnet({ expires_at: soon })] });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-expiring-soon"]')).not.toBeNull();
  });

  it('lists past carnets separately from the active one', () => {
    const { fixture } = setup({
      carnets: [carnet(), carnet({ id: 2, code: 'B3M9', is_active: false })],
    });

    expect(fixture.nativeElement.querySelector('[data-cy="carnet-history-toggle"]')).not.toBeNull();
  });

  it('sells a carnet with the chosen purchase date and reloads', () => {
    const { component, service } = setup();
    service.list.mockClear();

    (
      component as unknown as { sellForm: { patchValue: (v: { purchased_at: Date }) => void } }
    ).sellForm.patchValue({ purchased_at: new Date(2026, 2, 5) });
    (component as unknown as { confirmSell: () => void }).confirmSell();

    expect(service.sell).toHaveBeenCalledWith(42, '2026-03-05');
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('keeps the last known carnets when the reload fails', () => {
    const { component, service, fixture } = setup();
    service.list = vi.fn(() => throwError(() => ({ status: 500 })));

    (component as unknown as { confirmSell: () => void }).confirmSell();
    fixture.detectChanges();

    // Blanking the list would claim the athlete has no carnet — a worse lie
    // than stale data.
    expect(fixture.nativeElement.querySelector('[data-cy="carnet-balance-card"]')).not.toBeNull();
  });

  it('fetches the entry register only when it is opened', () => {
    const { component, service } = setup();

    expect(service.entries).not.toHaveBeenCalled();

    (component as unknown as { loadEntries: () => void }).loadEntries();

    expect(service.entries).toHaveBeenCalledWith(42, 1);
  });
});
