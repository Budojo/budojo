import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { ProfileTrainHereComponent } from './profile-train-here.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

/**
 * Coverage for the "Train at this academy" toggle (#750). Focuses on
 * the state-machine surface: initial fetch + happy-path enroll +
 * happy-path leave + error rollback. The roster chip + paid-column
 * hiding live in the athletes-list spec (#750 PR-B).
 */
describe('ProfileTrainHereComponent (#750)', () => {
  let httpMock: HttpTestingController;
  let messageAddSpy: ReturnType<typeof vi.fn>;

  function setup() {
    messageAddSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [ProfileTrainHereComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: MessageService, useValue: { add: messageAddSpy } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProfileTrainHereComponent);
    fixture.detectChanges();
    return { fixture };
  }

  function flushList(rows: Array<{ id: number; is_self?: boolean }>) {
    const req = httpMock.expectOne(`${environment.apiBase}/api/v1/athletes?per_page=100`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: rows });
  }

  it('starts in loading state, renders the spinner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[data-cy="profile-train-here-loading"]')).toBeTruthy();
    expect(root.querySelector('[data-cy="profile-train-here-toggle"]')).toBeFalsy();

    // Flush the initial GET so the harness doesn't complain about pending requests.
    flushList([]);
  });

  it('shows the toggle in OFF state when no self-row exists', () => {
    const { fixture } = setup();
    flushList([{ id: 1 }, { id: 2 }]);
    fixture.detectChanges();

    // Assert via the component's signal rather than PrimeNG's DOM
    // class — the rendered class name is an internal contract of the
    // ToggleSwitch component and varies between PrimeNG minor
    // versions. The signal is the source of truth our toggle binds to.
    const enrolled = (
      fixture.componentInstance as unknown as { enrolled(): boolean }
    ).enrolled();
    expect(enrolled).toBe(false);
  });

  it('shows the toggle in ON state when a self-row exists', () => {
    const { fixture } = setup();
    flushList([{ id: 1, is_self: true }]);
    fixture.detectChanges();

    const enrolled = (
      fixture.componentInstance as unknown as { enrolled(): boolean }
    ).enrolled();
    expect(enrolled).toBe(true);
  });

  it('surfaces the error banner when the discovery fetch fails', () => {
    const { fixture } = setup();
    const req = httpMock.expectOne(`${environment.apiBase}/api/v1/athletes?per_page=100`);
    req.error(new ProgressEvent('Network error'), { status: 500 });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-train-here-error"]'),
    ).toBeTruthy();
  });

  it('shows a success toast after enroll', async () => {
    const { fixture } = setup();
    flushList([]);
    fixture.detectChanges();

    // The component calls onToggle(true). We invoke it via the protected
    // method through a cast to bypass TS visibility — Vitest tests are
    // a legitimate consumer of internal state.
    (fixture.componentInstance as unknown as { onToggle(v: boolean): void }).onToggle(true);

    const postReq = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete`);
    expect(postReq.request.method).toBe('POST');
    postReq.flush({ data: { id: 42, is_self: true } });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(messageAddSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
  });

  it('rolls back the optimistic ON flip when enroll errors', async () => {
    const { fixture } = setup();
    flushList([]);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { onToggle(v: boolean): void }).onToggle(true);

    const postReq = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete`);
    postReq.error(new ProgressEvent('Server error'), { status: 500 });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(messageAddSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );

    // Optimistic flip rolled back — the signal should be OFF again.
    const enrolled = (
      fixture.componentInstance as unknown as { enrolled(): boolean }
    ).enrolled();
    expect(enrolled).toBe(false);
  });

  it('shows an info toast after leave', async () => {
    const { fixture } = setup();
    flushList([{ id: 5, is_self: true }]);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { onToggle(v: boolean): void }).onToggle(false);

    const delReq = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush(null, { status: 204, statusText: 'No Content' });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(messageAddSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info' }),
    );
  });

  afterEach(() => {
    httpMock.verify();
  });
});
