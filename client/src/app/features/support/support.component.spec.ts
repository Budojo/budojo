import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { SupportComponent } from './support.component';
import { SubmitSupportTicketPayload, SupportService } from '../../core/services/support.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AuthService } from '../../core/services/auth.service';

function setup(overrides: { submit?: SupportService['submit']; email?: string } = {}) {
  const submitSpy = vi.fn<SupportService['submit']>(
    overrides.submit ?? (() => of({ id: 1, createdAt: '2026-05-05T10:00:00Z' })),
  );
  const supportStub: Partial<SupportService> = { submit: submitSpy };
  const authStub: Partial<AuthService> = {
    user: signal(
      overrides.email === undefined
        ? null
        : {
            id: 1,
            name: 'Test User',
            email: overrides.email,
            email_verified_at: '2026-01-01T00:00:00Z',
            avatar_url: null,
          },
    ),
  };

  TestBed.configureTestingModule({
    imports: [SupportComponent],
    providers: [
      { provide: SupportService, useValue: supportStub },
      { provide: AuthService, useValue: authStub },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(SupportComponent);
  fixture.detectChanges();

  const messageService = fixture.debugElement.injector.get(MessageService);

  return { fixture, cmp: fixture.componentInstance, submitSpy, messageService };
}

describe('SupportComponent (#423)', () => {
  describe('form validation gates submit', () => {
    it('does not call the service when fields are empty', () => {
      const { cmp, submitSpy } = setup();

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
      expect(cmp['form'].controls.subject.touched).toBe(true);
      expect(cmp['form'].controls.category.touched).toBe(true);
      expect(cmp['form'].controls.body.touched).toBe(true);
    });

    it('does not call the service when subject is too short (< 3 chars)', () => {
      const { cmp, submitSpy } = setup();
      cmp['form'].setValue({
        subject: 'AB',
        category: 'account',
        body: 'A reasonably long body text.',
      });

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('does not call the service when category is null (none picked)', () => {
      const { cmp, submitSpy } = setup();
      cmp['form'].setValue({
        subject: 'Valid subject',
        category: null,
        body: 'A reasonably long body text.',
      });

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('does not call the service when body is too short (< 10 chars)', () => {
      const { cmp, submitSpy } = setup();
      cmp['form'].setValue({
        subject: 'Valid subject',
        category: 'bug',
        body: 'short',
      });

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('the submit button is disabled while the form is invalid', () => {
      const { fixture } = setup();
      const button = fixture.nativeElement.querySelector(
        '[data-cy="support-submit"] button',
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('happy path', () => {
    it('calls supportService.submit with the form values, then resets and toasts success', () => {
      const { cmp, submitSpy, messageService } = setup();
      const messageSpy = vi.fn();
      messageService.add = messageSpy;

      cmp['form'].setValue({
        subject: 'Cannot reset password',
        category: 'account',
        body: 'The reset link 404s every time I click it.',
      });

      cmp['submit']();

      expect(submitSpy).toHaveBeenCalledTimes(1);
      const payload = submitSpy.mock.calls[0][0] as SubmitSupportTicketPayload;
      expect(payload.subject).toBe('Cannot reset password');
      expect(payload.category).toBe('account');
      expect(payload.body).toContain('reset link');

      // Form reset on success.
      expect(cmp['form'].controls.subject.value).toBe('');
      expect(cmp['form'].controls.category.value).toBeNull();
      expect(cmp['form'].controls.body.value).toBe('');

      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });

    it('exposes the four category options as a typed array', () => {
      const { cmp } = setup();
      const values = cmp['categoryOptions'].map((o) => o.value);
      expect(values).toEqual(['account', 'billing', 'bug', 'other']);
    });
  });

  describe('error path', () => {
    it('toasts an error and keeps form contents on submit failure', () => {
      const { cmp, messageService } = setup({
        submit: () => throwError(() => new Error('boom')),
      });
      const messageSpy = vi.fn();
      messageService.add = messageSpy;

      cmp['form'].setValue({
        subject: 'Subject I do not want to retype',
        category: 'bug',
        body: 'Body I do not want to retype either.',
      });

      cmp['submit']();

      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
      expect(cmp['form'].controls.subject.value).toBe('Subject I do not want to retype');
      expect(cmp['form'].controls.category.value).toBe('bug');
      expect(cmp['form'].controls.body.value).toBe('Body I do not want to retype either.');
    });

    it('disables the submit button while a request is in flight', () => {
      const inflight = new Subject<{ id: number; createdAt: string }>();
      const { cmp, fixture } = setup({
        submit: () => inflight.asObservable(),
      });
      cmp['form'].setValue({
        subject: 'Valid subject',
        category: 'other',
        body: 'A reasonably long body text.',
      });

      cmp['submit']();
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector(
        '[data-cy="support-submit"] button',
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(true);

      inflight.next({ id: 1, createdAt: '2026-05-05T10:00:00Z' });
      inflight.complete();
    });
  });

  describe('reply hint', () => {
    it('exposes the user email when authenticated', () => {
      const { cmp } = setup({ email: 'support-tester@example.com' });
      expect(cmp['userEmail']()).toBe('support-tester@example.com');
    });

    it('returns null when no user is loaded', () => {
      const { cmp } = setup();
      expect(cmp['userEmail']()).toBeNull();
    });
  });
});
