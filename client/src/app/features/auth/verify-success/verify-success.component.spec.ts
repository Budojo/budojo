import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { VerifySuccessComponent } from './verify-success.component';
import { AuthService } from '../../../core/services/auth.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

function setup(opts: { hasToken?: boolean } = {}) {
  const getToken = vi.fn(() => (opts.hasToken === false ? null : 'tok'));
  const loadCurrentUser = vi.fn(() => EMPTY);
  const navigateByUrl = vi.fn(() => Promise.resolve(true));

  TestBed.configureTestingModule({
    imports: [VerifySuccessComponent],
    providers: [
      {
        provide: AuthService,
        useValue: { getToken, loadCurrentUser } as unknown as AuthService,
      },
      { provide: Router, useValue: { navigateByUrl } as Partial<Router> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(VerifySuccessComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, getToken, loadCurrentUser, navigateByUrl };
}

describe('VerifySuccessComponent (#174 + #580)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the cached user when a Sanctum token sits in localStorage on mount', () => {
    const { loadCurrentUser } = setup({ hasToken: true });
    expect(loadCurrentUser).toHaveBeenCalledOnce();
  });

  it('skips the user refresh when no token is present (cross-device verify click)', () => {
    const { loadCurrentUser } = setup({ hasToken: false });
    expect(loadCurrentUser).not.toHaveBeenCalled();
  });

  it('auto-redirects to /dashboard/athletes after the 3s timeout', () => {
    const { navigateByUrl } = setup();

    expect(navigateByUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2999);
    expect(navigateByUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/dashboard/athletes');
  });

  it('cancels the auto-redirect timer when goToDashboard fires manually (#173)', () => {
    const { cmp, navigateByUrl } = setup();

    cmp.goToDashboard();
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/dashboard/athletes');

    // The pending 3s timer should now be disarmed — letting it fire would
    // re-invoke navigateByUrl AND yank the user back to /dashboard/athletes
    // if they've already navigated elsewhere.
    vi.advanceTimersByTime(5000);
    expect(navigateByUrl).toHaveBeenCalledOnce();
  });

  it('clears the pending timeout on destroy so a fast unmount does not navigate', () => {
    const { fixture, navigateByUrl } = setup();

    fixture.destroy();
    vi.advanceTimersByTime(5000);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
