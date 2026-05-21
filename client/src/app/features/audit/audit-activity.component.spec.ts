import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Observable, of, throwError } from 'rxjs';
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
