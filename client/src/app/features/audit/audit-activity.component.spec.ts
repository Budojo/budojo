import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AuditEntriesPage, AuditService } from '../../core/services/audit.service';
import { AuditActivityComponent } from './audit-activity.component';

function emptyPage(overrides: Partial<AuditEntriesPage['meta']> = {}): AuditEntriesPage {
  return {
    data: [],
    meta: { current_page: 1, last_page: 1, total: 0, per_page: 20, ...overrides },
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
    ],
  });
  const svc = TestBed.inject(AuditService);
  vi.spyOn(svc, 'list').mockReturnValue(listReturn);
  const fixture = TestBed.createComponent(AuditActivityComponent);
  return { fixture, svc };
}

describe('AuditActivityComponent (#429 part 3)', () => {
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
