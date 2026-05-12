import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AthleteInviteComponent } from './athlete-invite.component';
import {
  AthleteInvitePreview,
  AthleteInviteService,
} from '../../core/services/athlete-invite.service';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup(
  opts: {
    token?: string | null;
    previewResponse?: AthleteInvitePreview | 'invalid';
    acceptResponse?: 'ok' | 'invite_revoked' | 'unknown_error_shape';
  } = {},
) {
  const previewValue: AthleteInvitePreview = {
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'mario@example.com',
    academy_name: 'Test Academy',
    expires_at: '2026-06-01T00:00:00Z',
  };

  const preview = vi.fn(() =>
    opts.previewResponse === 'invalid'
      ? throwError(() => ({ status: 410 }))
      : of(opts.previewResponse ?? previewValue),
  );

  const accept = vi.fn(() => {
    if (opts.acceptResponse === 'invite_revoked') {
      return throwError(() => ({ error: { errors: { token: ['invite_revoked'] } } }));
    }
    if (opts.acceptResponse === 'unknown_error_shape') {
      return throwError(() => ({ error: {} }));
    }
    return of({ token: 'new-sanctum-token', user: {} });
  });

  const adoptIssuedToken = vi.fn();
  const navigate = vi.fn(() => Promise.resolve(true));

  TestBed.configureTestingModule({
    imports: [AthleteInviteComponent],
    providers: [
      {
        provide: AthleteInviteService,
        useValue: { preview, accept } as unknown as AthleteInviteService,
      },
      {
        provide: AuthService,
        useValue: { adoptIssuedToken } as unknown as AuthService,
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(
              opts.token === undefined
                ? { token: 'a'.repeat(64) }
                : opts.token === null
                  ? {}
                  : { token: opts.token },
            ),
          },
        },
      },
      { provide: Router, useValue: { navigate } as Partial<Router> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(AthleteInviteComponent);
  fixture.detectChanges();
  return {
    fixture,
    cmp: fixture.componentInstance,
    preview,
    accept,
    adoptIssuedToken,
    navigate,
  };
}

describe('AthleteInviteComponent (#445 M7 PR-C)', () => {
  it('hydrates the preview on mount and flips state to ready when the token is valid', () => {
    const { cmp, preview } = setup();

    expect(preview).toHaveBeenCalledOnce();
    expect(preview).toHaveBeenCalledWith('a'.repeat(64));
    expect(cmp.state()).toBe('ready');
    expect(cmp.preview()).not.toBeNull();
  });

  it('flips state to invalid when no token is in the URL', () => {
    const { cmp, preview } = setup({ token: null });

    expect(preview).not.toHaveBeenCalled();
    expect(cmp.state()).toBe('invalid');
  });

  it('flips state to invalid when the preview endpoint errors (revoked / expired / unknown token)', () => {
    const { cmp } = setup({ previewResponse: 'invalid' });

    expect(cmp.state()).toBe('invalid');
    expect(cmp.preview()).toBeNull();
  });

  it('submit() with an invalid form marks all touched and does not call accept', () => {
    const { cmp, accept } = setup();
    // form starts empty — all required fields are invalid

    cmp.submit();

    expect(accept).not.toHaveBeenCalled();
    expect(cmp.form.touched).toBe(true);
  });

  it('submit() with a mismatched password leaves the form invalid (form-level mismatch validator)', () => {
    const { cmp, accept } = setup();

    cmp.form.patchValue({
      password: 'a-good-password',
      password_confirmation: 'a-different-one',
      privacy_accepted: true,
      terms_accepted: true,
    });

    cmp.submit();

    expect(accept).not.toHaveBeenCalled();
    expect(cmp.form.errors?.['mismatch']).toBe(true);
  });

  it('submit() on success adopts the issued token and navigates to /dashboard/me/profile', () => {
    const { cmp, accept, adoptIssuedToken, navigate } = setup();

    cmp.form.patchValue({
      password: 'a-good-password',
      password_confirmation: 'a-good-password',
      privacy_accepted: true,
      terms_accepted: true,
    });

    cmp.submit();

    expect(accept).toHaveBeenCalledOnce();
    expect(adoptIssuedToken).toHaveBeenCalledOnce();
    expect(adoptIssuedToken).toHaveBeenCalledWith('new-sanctum-token');
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/me/profile']);
  });

  it('submit() on a server error surfaces the precise error code', () => {
    const { cmp } = setup({ acceptResponse: 'invite_revoked' });

    cmp.form.patchValue({
      password: 'a-good-password',
      password_confirmation: 'a-good-password',
      privacy_accepted: true,
      terms_accepted: true,
    });

    cmp.submit();

    expect(cmp.state()).toBe('error');
    expect(cmp.errorMessage()).toBe('invite_revoked');
  });

  it("submit() on a server error without the expected shape falls back to 'unknown_error'", () => {
    const { cmp } = setup({ acceptResponse: 'unknown_error_shape' });

    cmp.form.patchValue({
      password: 'a-good-password',
      password_confirmation: 'a-good-password',
      privacy_accepted: true,
      terms_accepted: true,
    });

    cmp.submit();

    expect(cmp.state()).toBe('error');
    expect(cmp.errorMessage()).toBe('unknown_error');
  });
});
