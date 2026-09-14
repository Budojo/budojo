import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { LanguageService } from '../../core/services/language.service';
import { AuditEntriesPage, AuditService } from '../../core/services/audit.service';
import { AuthService } from '../../core/services/auth.service';
import { AuditActivityComponent } from './audit-activity.component';

function emptyPage(overrides: Partial<AuditEntriesPage['meta']> = {}): AuditEntriesPage {
  return {
    data: [],
    meta: { current_page: 1, last_page: 1, total: 0, per_page: 20, ...overrides },
  };
}

// #1624: one row, only to read its timestamp.
function pageWithEntry(
  createdAt: string,
  action = 'athlete.created',
  opts: { actorId?: number } = {},
): AuditEntriesPage {
  return {
    data: [
      {
        id: 1,
        action,
        actor_user_id: opts.actorId ?? 1,
        actor_label: 'Matteo Bonanno',
        subject_type: 'athlete',
        subject_id: 2,
        subject_label: 'Sara Colombo',
        before: null,
        after: null,
        ip: null,
        user_agent: null,
        created_at: createdAt,
      },
    ],
    meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 },
  };
}

function setup(listReturn: Observable<AuditEntriesPage> = of(emptyPage())): {
  fixture: ComponentFixture<AuditActivityComponent>;
  svc: AuditService;
} {
  TestBed.configureTestingModule({
    imports: [AuditActivityComponent],
    providers: [
      provideAnimationsAsync(),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideI18nTesting(),
      // Signed in as user 1 — the actor on every fixture row, which is the
      // case the log has to stop repeating (#1631).
      { provide: AuthService, useValue: { user: signal({ id: 1 }) } },
    ],
  });
  const svc = TestBed.inject(AuditService);
  vi.spyOn(svc, 'list').mockReturnValue(listReturn);
  const fixture = TestBed.createComponent(AuditActivityComponent);
  return { fixture, svc };
}

describe('AuditActivityComponent (#429 part 3)', () => {
  it("names the action in words, not in the code's vocabulary (#1631)", async () => {
    const { fixture } = setup(of(pageWithEntry('2026-09-14T16:12:00Z')));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const action = fixture.nativeElement.querySelector('[data-cy="audit-row-action"]');
    expect(action?.textContent?.trim()).toBe('Athlete added');
    expect(action?.className).not.toContain('audit-row__action--raw');
    // The key stays reachable for support, as a tooltip.
    expect(action?.getAttribute('title')).toContain('athlete.created');
  });

  it('falls back to the raw key for an action it has no sentence for (#1631)', async () => {
    // What a new server-side action looks like before anyone names it.
    const { fixture } = setup(of(pageWithEntry('2026-09-14T16:12:00Z', 'academy_class.created')));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const action = fixture.nativeElement.querySelector('[data-cy="audit-row-action"]');
    expect(action?.textContent?.trim()).toBe('academy_class.created');
    expect(action?.className).toContain('audit-row__action--raw');
  });

  it('leads with the subject and drops the actor when it is you (#1631)', async () => {
    const { fixture } = setup(of(pageWithEntry('2026-09-14T16:12:00Z')));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const body = fixture.nativeElement.querySelector('.audit-row__body');
    expect(body?.textContent).toContain('Sara Colombo');
    // Every row said "Matteo Bonanno → …" on a build with one user.
    expect(body?.textContent).not.toContain('Matteo Bonanno');
    expect(fixture.nativeElement.querySelector('.audit-row__actor')).toBeNull();
  });

  it('keeps the actor when somebody else did it (#1631)', async () => {
    const { fixture } = setup(
      of(pageWithEntry('2026-09-14T16:12:00Z', 'athlete.created', { actorId: 7 })),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.audit-row__actor')?.textContent).toContain(
      'Matteo Bonanno',
    );
  });

  it('offers the actions as a list to choose from, not a key to type (#1631)', async () => {
    const { fixture } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const options = (
      fixture.componentInstance as unknown as {
        actionOptions: () => { label: string; value: string }[];
      }
    ).actionOptions();

    expect(options[0]).toEqual({ label: 'All actions', value: '' });
    expect(options.map((o) => o.value)).toContain('athlete.deleted');
    expect(options.map((o) => o.label)).toContain('Athlete deleted');
  });

  it('writes the row timestamp in the active language, without seconds (#1624)', async () => {
    // `| date: 'medium'` formats against LOCALE_ID, which this app never
    // sets: the log read "Sep 14, 2026, 6:12:00 PM" under an Italian UI.
    const { fixture } = setup(of(pageWithEntry('2026-09-14T16:12:00Z')));
    TestBed.inject(LanguageService).setLanguage('it');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const date = fixture.nativeElement.querySelector('.audit-row__date')?.textContent ?? '';
    expect(date).toContain('14 set 2026');
    expect(date).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  afterEach(() => {
    // Drain any stray HTTP — the spy short-circuits the HttpClient,
    // but a future regression could leak a real request.
    const http = TestBed.inject(HttpTestingController);
    http.verify();
  });

  it('refetches on init with current filter values and per_page=20', () => {
    const { svc } = setup();
    expect(svc.list).toHaveBeenCalledTimes(1);
    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 20 }));
  });

  it('renders the empty-state block when the data array is empty', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="audit-empty"]')).not.toBeNull();
  });

  it('renders the error block when the service errors', () => {
    const { fixture } = setup(throwError(() => new Error('boom')));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="audit-error"]')).not.toBeNull();
  });

  it('onFilterReset() zeroes every filter control and refetches', () => {
    const { fixture, svc } = setup();
    const cmp = fixture.componentInstance as unknown as {
      filterForm: {
        setValue(v: { action: string; from: string; to: string }): void;
        getRawValue(): { action: string; from: string; to: string };
      };
      onFilterReset(): void;
    };
    cmp.filterForm.setValue({ action: 'athlete.deleted', from: '2026-05-01', to: '2026-05-21' });

    cmp.onFilterReset();

    expect(cmp.filterForm.getRawValue()).toEqual({ action: '', from: '', to: '' });
    expect(svc.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: undefined, from: undefined, to: undefined, page: 1 }),
    );
  });

  it('onPageChange translates PrimeNG 0-indexed page → API 1-indexed', () => {
    const { fixture, svc } = setup();
    const cmp = fixture.componentInstance as unknown as { onPageChange(e: { page: number }): void };

    cmp.onPageChange({ page: 2 });

    expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
  });

  it('cancels the in-flight request when a new filter-apply lands (switchMap, #933)', () => {
    // First emission hangs (never completes) — simulates a slow GET.
    // Second emission resolves immediately with a populated page.
    // switchMap should drop the first and only the second response
    // should land in entries() — a naive merge/concat would leak both
    // and the stale first response would briefly overwrite the second.
    const slow = new Subject<AuditEntriesPage>();
    const fast = of(emptyPage({ total: 7 })) satisfies Observable<AuditEntriesPage>;
    const listSpy = vi.fn<(f: unknown) => Observable<AuditEntriesPage>>();
    listSpy.mockReturnValueOnce(slow.asObservable()).mockReturnValueOnce(fast);

    TestBed.configureTestingModule({
      imports: [AuditActivityComponent],
      providers: [
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: AuditService, useValue: { list: listSpy } },
      ],
    });
    const fixture = TestBed.createComponent(AuditActivityComponent);
    fixture.detectChanges();

    // First request fires from constructor → hangs on `slow`.
    expect(listSpy).toHaveBeenCalledTimes(1);

    const cmp = fixture.componentInstance as unknown as {
      total: () => number;
      onFilterApply(): void;
    };
    cmp.onFilterApply(); // second emission — switchMap drops `slow`, subscribes to `fast`
    expect(listSpy).toHaveBeenCalledTimes(2);

    // Late completion of the cancelled stream MUST be ignored.
    slow.next(emptyPage({ total: 999 }));
    slow.complete();

    expect(cmp.total()).toBe(7);
  });

  it('keeps the stream alive after an error so the next filter-apply still fires (#936)', () => {
    // The switchMap pattern (#933) regressed error recovery: an error
    // surfacing on the OUTER subscribe would terminate the entire
    // stream, silently dropping every subsequent refetch until the
    // user reloaded the page. catchError inside the inner observable
    // keeps the outer alive.
    const listSpy = vi.fn<(f: unknown) => Observable<AuditEntriesPage>>();
    listSpy
      .mockReturnValueOnce(throwError(() => new Error('boom')))
      .mockReturnValueOnce(of(emptyPage({ total: 42 })));

    TestBed.configureTestingModule({
      imports: [AuditActivityComponent],
      providers: [
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: AuditService, useValue: { list: listSpy } },
      ],
    });
    const fixture = TestBed.createComponent(AuditActivityComponent);
    fixture.detectChanges();

    const cmp = fixture.componentInstance as unknown as {
      total: () => number;
      errored: () => boolean;
      onFilterApply(): void;
    };

    expect(cmp.errored()).toBe(true);
    expect(listSpy).toHaveBeenCalledTimes(1);

    // Second call MUST still fire — without catchError this is dropped.
    cmp.onFilterApply();
    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(cmp.total()).toBe(42);
  });

  it('onFilterApply forwards the populated filters to the service', () => {
    const { fixture, svc } = setup();
    const cmp = fixture.componentInstance as unknown as {
      filterForm: { setValue(v: { action: string; from: string; to: string }): void };
      onFilterApply(): void;
    };
    cmp.filterForm.setValue({ action: 'payment.updated', from: '2026-05-10', to: '2026-05-20' });

    cmp.onFilterApply();

    expect(svc.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'payment.updated',
        from: '2026-05-10',
        to: '2026-05-20',
        page: 1,
      }),
    );
  });
});
