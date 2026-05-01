import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { FeedbackComponent } from './feedback.component';
import { FeedbackService, SubmitFeedbackPayload } from '../../core/services/feedback.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup(overrides: { submit?: FeedbackService['submit'] } = {}) {
  const submitSpy = vi.fn<FeedbackService['submit']>(overrides.submit ?? (() => of(undefined)));
  const feedbackStub: Partial<FeedbackService> = { submit: submitSpy };

  TestBed.configureTestingModule({
    imports: [FeedbackComponent],
    providers: [{ provide: FeedbackService, useValue: feedbackStub }, ...provideI18nTesting()],
  });

  const fixture = TestBed.createComponent(FeedbackComponent);
  fixture.detectChanges();

  // Component-level MessageService instance — `providers: [MessageService]`
  // on the @Component, so it lives in the component injector, not the root.
  const messageService = fixture.debugElement.injector.get(MessageService);

  return { fixture, cmp: fixture.componentInstance, submitSpy, messageService };
}

describe('FeedbackComponent (#311)', () => {
  describe('form validation gates submit', () => {
    it('does not call the service when subject + description are empty', () => {
      const { cmp, submitSpy } = setup();

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
      // Touched after a blocked submit so error labels can render.
      expect(cmp['form'].controls.subject.touched).toBe(true);
      expect(cmp['form'].controls.description.touched).toBe(true);
    });

    it('does not call the service when subject is too short (< 3 chars)', () => {
      const { cmp, submitSpy } = setup();
      cmp['form'].setValue({
        subject: 'AB',
        description: 'A description that is long enough.',
      });

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('does not call the service when description is too short (< 10 chars)', () => {
      const { cmp, submitSpy } = setup();
      cmp['form'].setValue({
        subject: 'Valid subject',
        description: 'short',
      });

      cmp['submit']();

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('the submit button is disabled while the form is invalid', () => {
      const { fixture } = setup();
      const button = fixture.nativeElement.querySelector(
        '[data-cy="feedback-submit"] button',
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('happy path', () => {
    it('calls feedbackService.submit with the form values + image, then resets and toasts success', () => {
      const { cmp, submitSpy, messageService } = setup();
      const messageSpy = vi.fn();
      messageService.add = messageSpy;

      const file = new File(['content'], 'shot.png', { type: 'image/png' });
      cmp['form'].setValue({
        subject: 'Athletes list paid filter is sticky',
        description: 'When I clear the paid filter the URL still carries it.',
      });
      cmp['image'].set(file);

      cmp['submit']();

      expect(submitSpy).toHaveBeenCalledTimes(1);
      const payload = submitSpy.mock.calls[0][0] as SubmitFeedbackPayload;
      expect(payload.subject).toBe('Athletes list paid filter is sticky');
      expect(payload.description).toContain('paid filter');
      expect(payload.image).toBe(file);

      // Form reset on success — subject + description back to empty,
      // image cleared.
      expect(cmp['form'].controls.subject.value).toBe('');
      expect(cmp['form'].controls.description.value).toBe('');
      expect(cmp['image']()).toBeNull();

      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    });

    it('passes image=null when no attachment was selected', () => {
      const { cmp, submitSpy } = setup();
      cmp['form'].setValue({
        subject: 'Plain text feedback',
        description: 'No screenshot needed for this one.',
      });

      cmp['submit']();

      const payload = submitSpy.mock.calls[0][0] as SubmitFeedbackPayload;
      expect(payload.image).toBeNull();
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
        description: 'Description I do not want to retype either.',
      });

      cmp['submit']();

      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
      // Form contents preserved so the user can retry without re-typing.
      expect(cmp['form'].controls.subject.value).toBe('Subject I do not want to retype');
      expect(cmp['form'].controls.description.value).toBe(
        'Description I do not want to retype either.',
      );
    });

    it('disables the submit button while a request is in flight', () => {
      const inflight = new Subject<void>();
      const { cmp, fixture } = setup({
        submit: () => inflight.asObservable(),
      });
      cmp['form'].setValue({
        subject: 'Valid subject',
        description: 'A description that is long enough.',
      });

      cmp['submit']();
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector(
        '[data-cy="feedback-submit"] button',
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(true);

      inflight.next();
      inflight.complete();
    });
  });

  describe('client-side image validation', () => {
    // jsdom doesn't implement DataTransfer, so build a fake FileList
    // by hand — the component only reads `event.target.files?.[0]`,
    // so a minimal stub is enough.
    function fileEvent(file: File | null): Event {
      const files = file === null ? null : ([file] as unknown as FileList);
      return { target: { files } } as unknown as Event;
    }

    it('rejects non-png/jpeg/webp files with a translated error and clears state', () => {
      const { cmp } = setup();
      const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' });

      cmp['onFileSelected'](fileEvent(pdf));

      expect(cmp['image']()).toBeNull();
      expect(cmp['imageError']()).toBe('Only PNG, JPEG and WEBP images are accepted.');
    });

    it('rejects oversized images (> 5 MB)', () => {
      const { cmp } = setup();
      // 6 MB png
      const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', {
        type: 'image/png',
      });

      cmp['onFileSelected'](fileEvent(big));

      expect(cmp['image']()).toBeNull();
      expect(cmp['imageError']()).toBe('Image is too large. Max size is 5 MB.');
    });

    it('accepts a valid png and stores the file in the signal', () => {
      const { cmp } = setup();
      const ok = new File(['x'], 'shot.png', { type: 'image/png' });

      cmp['onFileSelected'](fileEvent(ok));

      expect(cmp['image']()).toBe(ok);
      expect(cmp['imageError']()).toBeNull();
    });

    it('clearImage() drops the selected file and any error', () => {
      const { cmp } = setup();
      cmp['image'].set(new File(['x'], 'shot.png', { type: 'image/png' }));

      cmp['clearImage']();

      expect(cmp['image']()).toBeNull();
      expect(cmp['imageError']()).toBeNull();
    });
  });
});
