import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { ProfileTrainHereComponent } from './profile-train-here.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ALL_CAPABILITIES, RuntimeService } from '../../../core/services/runtime.service';

/**
 * Coverage for the "Train at this academy" toggle (#750). Focuses on
 * the state-machine surface: initial fetch + happy-path enroll +
 * happy-path leave + error rollback. The roster chip + paid-column
 * hiding live in the athletes-list spec (#750 PR-B).
 */
describe('ProfileTrainHereComponent (#750)', () => {
  let httpMock: HttpTestingController;
  let messageAddSpy: ReturnType<typeof vi.fn>;

  function setup(capabilities: readonly string[] = ALL_CAPABILITIES) {
    messageAddSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [ProfileTrainHereComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: MessageService, useValue: { add: messageAddSpy } },
        {
          provide: RuntimeService,
          useValue: {
            profile: signal(capabilities.includes('email') ? 'web' : 'desktop'),
            has: signal((capability: string) => capabilities.includes(capability)),
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProfileTrainHereComponent);
    fixture.detectChanges();
    return { fixture };
  }

  function flushState(state: { enrolled: boolean; athlete_id: number | null }) {
    // `state()` now hits the dedicated `/me/athlete/state` endpoint
    // (#761) — previously walked one page of `/athletes` which silently
    // missed self-rows on rosters > 20. The mock matches the new shape:
    // `{ data: { enrolled, athlete_id } }`.
    const req = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete/state`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: state });
  }

  it('does not bring the promise back in the enrol toast (#1626)', async () => {
    // The paragraph stopped saying it; the toast still did, so flipping the
    // toggle on a desktop build put it straight back on screen.
    const { fixture } = setup([]);
    flushState({ enrolled: false, athlete_id: null });
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      'p-toggleswitch input, [data-cy="train-here-toggle"] input',
    ) as HTMLInputElement | null;
    expect(toggle).not.toBeNull();
    toggle!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const enrol = httpMock.match((r) => r.method === 'POST');
    if (enrol.length > 0) {
      enrol[0].flush({ data: { id: 9 } });
      fixture.detectChanges();
      await fixture.whenStable();
    }

    const detail = messageAddSpy.mock.calls.map((c) => JSON.stringify(c[0])).join(' ');
    expect(detail).not.toContain('community');
  });

  it('does not promise community posts on a build without a feed (#1626)', () => {
    const { fixture } = setup([]);
    flushState({ enrolled: false, athlete_id: null });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Add yourself to the roster');
    expect(text).not.toContain('community posts');
  });

  it('keeps the community sentence where there is a community (#1626)', () => {
    const { fixture } = setup();
    flushState({ enrolled: false, athlete_id: null });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('community posts');
  });

  it('starts in loading state, renders the spinner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[data-cy="profile-train-here-loading"]')).toBeTruthy();
    expect(root.querySelector('[data-cy="profile-train-here-toggle"]')).toBeFalsy();

    // Flush the initial GET so the harness doesn't complain about pending requests.
    flushState({ enrolled: false, athlete_id: null });
  });

  it('shows the toggle in OFF state when no self-row exists', () => {
    const { fixture } = setup();
    flushState({ enrolled: false, athlete_id: null });
    fixture.detectChanges();

    // Assert via the component's signal rather than PrimeNG's DOM
    // class — the rendered class name is an internal contract of the
    // ToggleSwitch component and varies between PrimeNG minor
    // versions. The signal is the source of truth our toggle binds to.
    const enrolled = (fixture.componentInstance as unknown as { enrolled(): boolean }).enrolled();
    expect(enrolled).toBe(false);
  });

  it('shows the toggle in ON state when a self-row exists', () => {
    const { fixture } = setup();
    flushState({ enrolled: true, athlete_id: 1 });
    fixture.detectChanges();

    const enrolled = (fixture.componentInstance as unknown as { enrolled(): boolean }).enrolled();
    expect(enrolled).toBe(true);
  });

  it('surfaces the error banner when the discovery fetch fails', () => {
    const { fixture } = setup();
    const req = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete/state`);
    req.error(new ProgressEvent('Network error'), { status: 500 });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-train-here-error"]'),
    ).toBeTruthy();
  });

  it('shows a success toast after enroll', async () => {
    const { fixture } = setup();
    flushState({ enrolled: false, athlete_id: null });
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

    expect(messageAddSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('rolls back the optimistic ON flip when enroll errors', async () => {
    const { fixture } = setup();
    flushState({ enrolled: false, athlete_id: null });
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { onToggle(v: boolean): void }).onToggle(true);

    const postReq = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete`);
    postReq.error(new ProgressEvent('Server error'), { status: 500 });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(messageAddSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));

    // Optimistic flip rolled back — the signal should be OFF again.
    const enrolled = (fixture.componentInstance as unknown as { enrolled(): boolean }).enrolled();
    expect(enrolled).toBe(false);
  });

  it('shows an info toast after leave', async () => {
    const { fixture } = setup();
    flushState({ enrolled: true, athlete_id: 5 });
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { onToggle(v: boolean): void }).onToggle(false);

    const delReq = httpMock.expectOne(`${environment.apiBase}/api/v1/me/athlete`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush(null, { status: 204, statusText: 'No Content' });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(messageAddSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info' }));
  });

  afterEach(() => {
    httpMock.verify();
  });
});
