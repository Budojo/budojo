import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService } from 'primeng/api';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { SyncConflict } from '../../core/sync/conflicts';
import { HttpSyncServer } from '../../core/sync/http-sync-server';
import { SyncService } from '../../core/sync/sync.service';
import { SyncDecideComponent } from './sync-decide.component';

/** «Da decidere» (#2038, PRD § 6.4): what a rebase set aside, for the owner to answer. */
describe('SyncDecideComponent', () => {
  const LUCA = {
    id: 57,
    name: 'Luca Bianchi',
    first_name: 'Luca',
    last_name: 'Bianchi',
    belt: 'white',
    stripes: 0,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
  };

  function conflict(overrides: Partial<SyncConflict> = {}): SyncConflict {
    return {
      id: '01K6F3Q8Z4M7X2N5P9R1T3V6W8',
      device: 'phone9c1e',
      route: 'athletes.update',
      reason: 'changed',
      detail: { field: 'last_name', saw: 'Bianchi', here: 'Verdi' },
      entry: {
        method: 'PATCH',
        params: { athlete: 57 },
        body: { last_name: 'Bianco' },
        before: null,
      },
      recorded_at: '2026-10-03T18:32:05+00:00',
      subject: { athlete: LUCA, others: 0 } as SyncConflict['subject'],
      retry: [{ method: 'PATCH', url: '/api/v1/athletes/57', body: { last_name: 'Bianco' } }],
      ...overrides,
    } as SyncConflict;
  }

  async function setup(listed: SyncConflict[]) {
    const server = {
      conflicts: vi.fn(async () => listed),
      decide: vi.fn(async () => undefined),
      retry: vi.fn(async () => undefined),
    };
    const sync = { countToDecide: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      imports: [SyncDecideComponent],
      providers: [
        provideAnimationsAsync(),
        provideRouter([]),
        ...provideI18nTesting(),
        { provide: HttpSyncServer, useValue: server },
        { provide: SyncService, useValue: sync },
      ],
    });
    const fixture = TestBed.createComponent(SyncDecideComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const items = () => el.querySelectorAll('[data-cy="sync-decide-item"]');
    const click = async (selector: string) => {
      el.querySelector<HTMLElement>(`${selector} button`)?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, server, sync, el, items, click };
  }

  it('says what it was, whom it is about, and both sides: the phone’s and the PC’s', async () => {
    const { el, items } = await setup([conflict()]);

    expect(items()).toHaveLength(1);
    expect(el.querySelector('app-athlete-identity')).not.toBeNull();
    expect(el.textContent).toContain('Athlete details');
    expect(el.textContent).toContain('Changed on both');
    const sides = el.querySelector('[data-cy="sync-decide-sides"]')?.textContent ?? '';
    expect(sides).toContain('Last name · On the phone');
    expect(sides).toContain('Bianco');
    expect(sides).toContain('Last name · On the PC');
    expect(sides).toContain('Verdi');
  });

  it('keeps the PC’s: records the answer, takes the question off, and counts again', async () => {
    const { server, sync, items, click } = await setup([conflict()]);

    await click('[data-cy="sync-decide-theirs"]');

    expect(server.retry).not.toHaveBeenCalled();
    expect(server.decide).toHaveBeenCalledWith('01K6F3Q8Z4M7X2N5P9R1T3V6W8', 'theirs');
    expect(items()).toHaveLength(0);
    expect(sync.countToDecide).toHaveBeenCalled();
  });

  it('keeps the phone’s after a confirm that says what it replaces: the retry first, then the answer', async () => {
    const { fixture, server, click } = await setup([conflict()]);
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const confirm = vi.spyOn(confirmation, 'confirm');

    await click('[data-cy="sync-decide-mine"]');
    const asked = confirm.mock.calls[0][0];
    expect(asked.message).toBe('The phone’s takes the place of the PC’s.'.replace(/’/g, "'"));
    asked.accept?.();
    await fixture.whenStable();

    expect(server.retry).toHaveBeenCalledWith([
      { method: 'PATCH', url: '/api/v1/athletes/57', body: { last_name: 'Bianco' } },
    ]);
    expect(server.decide).toHaveBeenCalledWith('01K6F3Q8Z4M7X2N5P9R1T3V6W8', 'mine');
  });

  it('keeps the question and says why when the phone’s write does not go through', async () => {
    const { fixture, server, el, items } = await setup([conflict()]);
    server.retry.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 422,
        error: { message: 'A payment already covers 2026-08.' },
      }),
    );
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((options) => {
      options.accept?.();
      return confirmation;
    });

    el.querySelector<HTMLElement>('[data-cy="sync-decide-mine"] button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(server.decide).not.toHaveBeenCalled();
    expect(items()).toHaveLength(1);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'A payment already covers 2026-08.',
    );
  });

  it('offers no «Keep the phone’s» when nothing would make it true here, and says so', async () => {
    const { el } = await setup([conflict({ reason: 'gone', detail: {}, retry: null })]);

    expect(el.querySelector('[data-cy="sync-decide-mine"]')).toBeNull();
    expect(el.textContent).toContain("The phone's cannot be put back from here");
    expect(el.textContent).toContain('Gone on the other device');
  });

  it('names a payment by its month, and a lesson by its day', async () => {
    const { el } = await setup([
      conflict({
        id: '01K6F3Q8Z4M7X2N5P9R1T3V6W1',
        route: 'athletes.payments.store',
        reason: 'differs',
        detail: { field: 'payment_method', mine: 'cash', here: 'pos' },
        entry: {
          method: 'POST',
          params: { athlete: 57 },
          body: { year: 2026, month: 10 },
          before: null,
        },
      }),
      conflict({
        id: '01K6F3Q8Z4M7X2N5P9R1T3V6W2',
        route: 'lessons.topics.update',
        subject: null,
        detail: { field: 'topic_ids', saw: [1], here: [3] },
        entry: {
          method: 'PUT',
          params: {},
          body: { held_on: '2026-10-01', topic_ids: [2, 4] },
          before: null,
        },
      }),
    ]);

    expect(el.textContent).toContain('Payment for October 2026');
    expect(el.textContent).toContain('Cash');
    expect(el.textContent).toContain('Card');
    expect(el.textContent).toContain('Topics of the lesson on');
    expect(el.textContent).toContain('2 topics');
  });

  it('says there is nothing to decide when nothing waits', async () => {
    const { el } = await setup([]);

    expect(el.querySelector('[data-cy="sync-decide-empty"]')?.textContent).toContain(
      'Nothing to decide',
    );
  });
});
