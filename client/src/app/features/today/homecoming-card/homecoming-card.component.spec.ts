import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService } from '../../../core/services/language.service';
import { Homecoming } from '../../../core/sync/homecoming';
import { SyncService } from '../../../core/sync/sync.service';
import { HomecomingCardComponent } from './homecoming-card.component';

/** The homecoming on Oggi (#2039, PRD § 6.2): what the other device's work brought. */
describe('HomecomingCardComponent', () => {
  const ARRIVED: Homecoming = {
    device: 'phone9c1e',
    at: new Date(2026, 9, 6, 21, 47).toISOString(),
    through: '01K6F3Q9A1B2C3D4E5F6G7H8J9',
    attendance: [
      { lesson: 'BJJ Gi', count: 14 },
      { lesson: null, count: 1 },
    ],
    payments: { count: 2, amount_cents: 12000 },
    athletes: 1,
    promotions: 0,
    other: 3,
  };

  function setup(arrived: Homecoming | null) {
    const homecoming = signal<Homecoming | null>(arrived);
    const sync = {
      homecoming: homecoming.asReadonly(),
      seenHomecoming: vi.fn(() => homecoming.set(null)),
    };
    TestBed.configureTestingModule({
      imports: [HomecomingCardComponent],
      providers: [
        provideAnimationsAsync(),
        ...provideI18nTesting(),
        { provide: SyncService, useValue: sync },
      ],
    });
    const fixture = TestBed.createComponent(HomecomingCardComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = () => el.querySelector<HTMLElement>('[data-cy="today-homecoming"]');
    const items = () =>
      [...el.querySelectorAll('.homecoming__item')].map((item) =>
        item.textContent?.replace(/\u00a0/g, ' ').trim(),
      );
    return { fixture, homecoming, sync, el, card, items };
  }

  afterEach(() => vi.useRealTimers());

  it('says where the work came from and when, and what it brought', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 8, 9, 0));
    const { card, items } = setup(ARRIVED);

    expect(card()?.querySelector('h2')?.textContent?.trim()).toBe(
      'From the phone, Tuesday at 21:47',
    );
    expect(card()?.querySelector('.pi-mobile')).not.toBeNull();
    expect(items()).toEqual([
      '14 attendances in BJJ Gi',
      '1 attendance',
      '2 payments (€120.00)',
      '1 new athlete',
      '3 other changes',
    ]);
  });

  it('speaks Italian, and names the PC for its work', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 23, 0));
    const { fixture, card, items, homecoming } = setup(null);
    TestBed.inject(LanguageService).setLanguage('it');
    homecoming.set({
      ...ARRIVED,
      device: 'pc4f2a',
      attendance: [{ lesson: 'BJJ Gi', count: 1 }],
      payments: { count: 1, amount_cents: 6000 },
      athletes: 2,
      promotions: 1,
      other: 1,
    });
    fixture.detectChanges();

    expect(card()?.querySelector('h2')?.textContent?.trim()).toBe('Dal PC, oggi alle 21:47');
    expect(card()?.querySelector('.pi-desktop')).not.toBeNull();
    expect(items()).toEqual([
      '1 presenza in BJJ Gi',
      '1 pagamento (60,00 €)',
      '2 nuovi atleti',
      '1 promozione',
      '1 altra modifica',
    ]);
  });

  it('says yesterday, and the date once it is a week old', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 7, 8, 0));
    const { fixture, card, homecoming } = setup(ARRIVED);
    expect(card()?.querySelector('h2')?.textContent).toContain('yesterday at 21:47');

    vi.setSystemTime(new Date(2026, 9, 20, 8, 0));
    homecoming.set({ ...ARRIVED, through: '01K6F3Q9A1B2C3D4E5F6G7H8K0' });
    fixture.detectChanges();

    expect(card()?.querySelector('h2')?.textContent).toContain('6 Oct at 21:47');
  });

  it('goes once opened: told as seen at once, and on screen until the owner closes it', () => {
    const { fixture, card, sync, el } = setup(ARRIVED);

    expect(sync.seenHomecoming).toHaveBeenCalledExactlyOnceWith(ARRIVED);
    expect(card()).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-cy="today-homecoming-close"] button')?.click();
    fixture.detectChanges();

    expect(card()).toBeNull();
  });

  it('shows nothing when nothing arrived', () => {
    const { card, sync } = setup(null);

    expect(card()).toBeNull();
    expect(sync.seenHomecoming).not.toHaveBeenCalled();
  });
});
