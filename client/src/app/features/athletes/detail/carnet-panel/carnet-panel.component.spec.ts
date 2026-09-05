import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
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
    valid_from: '2026-01-10',
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
      ConfirmationService,
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

  it('puts the carnet expiring soonest on the card, not the newest bought', () => {
    // The server spends the earliest-expiring one. A card showing a different
    // carnet would disagree with both the roster chip and the actual charge.
    const { fixture } = setup({
      carnets: [
        carnet({ id: 9, code: 'NEWER', expires_at: '2027-06-01', remaining_entries: 10 }),
        carnet({ id: 4, code: 'SOONER', expires_at: '2026-11-01', remaining_entries: 4 }),
      ],
    });

    expect(text(fixture)).toContain('SOONER');
    expect(
      fixture.nativeElement.querySelector('[data-cy="carnet-remaining"]').textContent.trim(),
    ).toBe('4');
  });

  it('keeps a second still-valid carnet visible instead of dropping it', () => {
    const { fixture } = setup({
      carnets: [
        carnet({ id: 9, code: 'NEWER', expires_at: '2027-06-01' }),
        carnet({ id: 4, code: 'SOONER', expires_at: '2026-11-01' }),
      ],
    });

    // It is not on the card, so it must be in the secondary list — filtering
    // the list on `!is_active` would make it vanish from the UI entirely.
    expect(fixture.nativeElement.querySelector('[data-cy="carnet-history-list"]')).not.toBeNull();
    expect(text(fixture)).toContain('NEWER');
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

    expect(service.sell).toHaveBeenCalledWith(42, '2026-03-05', undefined);
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

  it('omits the purchase date entirely when the owner does not set one', () => {
    // Empty means "today" server-side. Sending a formatted null would be a
    // 422 instead.
    const { component, service } = setup();

    (component as unknown as { confirmSell: () => void }).confirmSell();

    expect(service.sell).toHaveBeenCalledWith(42, undefined, undefined);
  });

  it('sends a back-dated validity when the owner sets one', () => {
    // The point of #1380: a carnet dated to cover a period already on the
    // register. The server counts those sessions immediately.
    const { component, service } = setup();

    (
      component as unknown as {
        sellForm: { patchValue: (v: { valid_from: Date }) => void };
      }
    ).sellForm.patchValue({ valid_from: new Date(2026, 5, 1) });
    (component as unknown as { confirmSell: () => void }).confirmSell();

    expect(service.sell).toHaveBeenCalledWith(42, undefined, '2026-06-01');
  });

  it('previews the expiry the chosen validity start would produce', () => {
    // The window is always twelve months, so pulling the start back spends
    // validity. The owner has to see where the far end lands before saving.
    const { component, fixture } = setup();

    (component as unknown as { openValidityDialog: (c: Carnet) => void }).openValidityDialog(
      carnet({ valid_from: '2026-09-01' }),
    );
    (
      component as unknown as {
        validityForm: { patchValue: (v: { valid_from: Date }) => void };
      }
    ).validityForm.patchValue({ valid_from: new Date(2026, 2, 1) });
    fixture.detectChanges();

    expect(
      (component as unknown as { previewExpiry: () => string | null }).previewExpiry(),
    ).toContain('2027');
  });

  it('offers the same actions on a spent carnet, which is where a mis-sale lands', () => {
    // A carnet dated far enough back to consume every entry is not active, so
    // it drops into the history list — and that is precisely the mistake worth
    // undoing, so the history rows carry the actions too.
    const { fixture } = setup({
      carnets: [carnet({ id: 3, is_active: false, remaining_entries: 0 })],
    });

    expect(
      fixture.nativeElement.querySelector('[data-cy="carnet-history-delete-3"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="carnet-history-edit-3"]')).not.toBeNull();
  });

  it('explains a 422 as a missing academy configuration', () => {
    const { component, service } = setup();
    service.sell = vi.fn(() => throwError(() => ({ status: 422 })));
    const messages = TestBed.inject(MessageService);
    const add = vi.spyOn(messages, 'add');

    (component as unknown as { confirmSell: () => void }).confirmSell();

    // The resolved English string, not the key: asserting the key would pass
    // even if the key were missing from the bundle, which is exactly the
    // failure mode that ships green and renders raw keys in production.
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'Set a carnet price and size in your academy settings first.',
      }),
    );
  });

  it('fetches the entry register only when it is opened', () => {
    const { component, service } = setup();

    expect(service.entries).not.toHaveBeenCalled();

    (component as unknown as { loadEntries: () => void }).loadEntries();

    expect(service.entries).toHaveBeenCalledWith(42, 1);
  });
});
