import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { NotSeenLatelyComponent } from './not-seen-lately.component';
import {
  StatsService,
  type AtRiskList,
  type AtRiskRow,
} from '../../../../core/services/stats.service';
import { AthleteService } from '../../../../core/services/athlete.service';

/** A `Y-m-d` day `n` days before today, in local time — what the server sends. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function row(over: Partial<AtRiskRow> & { id: number; last?: string; phone?: boolean }): AtRiskRow {
  const { id, last, phone = true, ...rest } = over;
  return {
    athlete: {
      id,
      first_name: 'Athlete',
      last_name: `N${id}`,
      belt: 'blue',
      stripes: 1,
      date_of_birth: null,
      status: 'active',
      phone_country_code: phone ? '+39' : null,
      phone_national_number: phone ? '3331234567' : null,
    },
    tier: 'dropping',
    last_attended_on: last ?? daysAgo(2),
    recent_attended: 1,
    recent_sessions: 8,
    baseline_attended: 14,
    baseline_sessions: 24,
    ...rest,
  };
}

function list(data: AtRiskRow[], available = 32, needed = 20): AtRiskList {
  return { data, meta: { sessions_available: available, sessions_needed: needed } };
}

function render(response: Observable<AtRiskList>) {
  const stats = { atRisk: vi.fn(() => response) };
  const athletes = { update: vi.fn(() => of({})) };
  TestBed.configureTestingModule({
    imports: [NotSeenLatelyComponent],
    providers: [
      provideRouter([]),
      ...provideI18nTesting(),
      MessageService,
      { provide: StatsService, useValue: stats },
      { provide: AthleteService, useValue: athletes },
    ],
  });
  const fixture = TestBed.createComponent(NotSeenLatelyComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, stats, athletes };
}

function text(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('NotSeenLatelyComponent (#1729)', () => {
  it('renders one row per athlete, in the order the endpoint returned them', () => {
    const { root } = render(
      of(
        list([
          row({ id: 3, tier: 'gone', last: daysAgo(35) }),
          row({ id: 1, tier: 'quiet', last: daysAgo(9) }),
          row({ id: 2, tier: 'dropping' }),
        ]),
      ),
    );

    const ids = Array.from(root.querySelectorAll('[data-cy^="not-seen-row-"]')).map((el) =>
      el.getAttribute('data-cy'),
    );
    expect(ids).toEqual(['not-seen-row-3', 'not-seen-row-1', 'not-seen-row-2']);
    expect(text(root, '[data-cy="not-seen-toggle"]')).toContain('3 athletes');
  });

  it('reads a drop back as its four numbers, in words', () => {
    const { root } = render(of(list([row({ id: 1, tier: 'dropping' })])));

    expect(text(root, '[data-cy="not-seen-row-1"] .not-seen__reason')).toBe(
      '1 of the last 8 · was 14 of 24',
    );
    expect(text(root, '[data-cy="not-seen-row-1"] .not-seen__tier')).toBe('Coming less');
  });

  it('reads an absence as a distance, and never-came as such', () => {
    const { root } = render(
      of(
        list([
          row({ id: 1, tier: 'gone', last: daysAgo(35) }),
          row({ id: 2, tier: 'gone', last_attended_on: null }),
          row({ id: 3, tier: 'quiet', last: daysAgo(9) }),
        ]),
      ),
    );

    expect(text(root, '[data-cy="not-seen-row-1"] .not-seen__reason')).toBe(
      'Last seen 5 weeks ago',
    );
    expect(text(root, '[data-cy="not-seen-row-2"] .not-seen__reason')).toBe(
      'No sessions since joining',
    );
    expect(text(root, '[data-cy="not-seen-row-3"] .not-seen__reason')).toBe('Last seen a week ago');
    expect(text(root, '[data-cy="not-seen-row-1"] .not-seen__tier')).toBe('Away for a while');
  });

  it('says "nobody is drifting" only when there is enough history to know', () => {
    // The regression worth a test: turning "we cannot tell" into "all fine".
    const healthy = render(of(list([], 32, 20))).root;
    expect(healthy.querySelector('[data-cy="not-seen-empty-healthy"]')).not.toBeNull();
    expect(healthy.querySelector('[data-cy="not-seen-empty-no-history"]')).toBeNull();

    TestBed.resetTestingModule();
    const young = render(of(list([], 15, 20))).root;
    expect(young.querySelector('[data-cy="not-seen-empty-healthy"]')).toBeNull();
    expect(text(young, '[data-cy="not-seen-empty-no-history"]')).toContain('15 of the 20 needed');
  });

  it('points an academy with no attendance at all to the check-in', () => {
    const { root } = render(of(list([], 0, 20)));

    const empty = root.querySelector('[data-cy="not-seen-empty-no-attendance"]');
    expect(empty).not.toBeNull();
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/dashboard/attendance');
  });

  it('renders nothing when the request fails, so the roster stays whole', () => {
    const { root } = render(throwError(() => new Error('500')));

    expect(root.querySelector('[data-cy="not-seen-lately"]')).toBeNull();
  });

  it('offers WhatsApp and a call for a number, and a disabled control without one', () => {
    const { root } = render(of(list([row({ id: 1 }), row({ id: 2, phone: false })])));

    expect(
      root.querySelector('[data-cy="not-seen-contact-1-whatsapp"]')?.getAttribute('href'),
    ).toBe('https://wa.me/393331234567');
    expect(
      root.querySelector('[data-cy="not-seen-contact-1-whatsapp"]')?.getAttribute('target'),
    ).toBe('_blank');
    expect(
      root.querySelector('[data-cy="not-seen-contact-2-none"]')?.getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('marks an athlete inactive behind the destructive confirm, then drops the row and says so', () => {
    const { fixture, root, athletes } = render(of(list([row({ id: 1 }), row({ id: 2 })])));
    const cmp = fixture.componentInstance;
    const emitted: number[] = [];
    cmp.markedInactive.subscribe((id) => emitted.push(id));
    const confirm = vi.spyOn(fixture.debugElement.injector.get(ConfirmationService), 'confirm');

    const anchor = document.createElement('button');
    const items = cmp['markInactiveItems'](cmp['list']()!.data[0], anchor);
    items[0].command!({});

    expect(confirm).toHaveBeenCalledTimes(1);
    const args = confirm.mock.calls[0][0];
    expect(args.target).toBe(anchor);
    expect(args.acceptButtonProps).toEqual({ severity: 'danger' });
    expect(args.rejectLabel).toBe('Cancel');
    expect(athletes.update).not.toHaveBeenCalled();

    args.accept!();
    fixture.detectChanges();

    expect(athletes.update).toHaveBeenCalledWith(1, { status: 'inactive' });
    expect(emitted).toEqual([1]);
    expect(root.querySelector('[data-cy="not-seen-row-1"]')).toBeNull();
    expect(root.querySelector('[data-cy="not-seen-row-2"]')).not.toBeNull();
  });

  it('folds away and opens again from its header', () => {
    const { fixture, root } = render(of(list([row({ id: 1 })])));
    const toggle = root.querySelector('[data-cy="not-seen-toggle"]') as HTMLButtonElement;

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[data-cy="not-seen-row-1"]')).toBeNull();
  });

  it('asks once, and never recomputes a tier', () => {
    // The tiers are the server's; the section renders what it is given.
    const { stats, root } = render(of(list([row({ id: 1, tier: 'quiet', recent_attended: 7 })])));

    expect(stats.atRisk).toHaveBeenCalledTimes(1);
    expect(text(root, '[data-cy="not-seen-row-1"] .not-seen__tier')).toBe('Absent lately');
  });
});
