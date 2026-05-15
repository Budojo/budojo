import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { NotificationOnboardingDialogComponent } from './notification-onboarding-dialog.component';
import {
  NotificationOnboardingService,
  NotificationOnboardingState,
} from '../../../core/services/notification-onboarding.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('NotificationOnboardingDialogComponent (#745)', () => {
  let state: ReturnType<typeof signal<NotificationOnboardingState>>;
  let accept: ReturnType<typeof vi.fn>;
  let dismiss: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  function setup() {
    state = signal<NotificationOnboardingState>('idle');
    accept = vi.fn().mockResolvedValue(undefined);
    dismiss = vi.fn();
    close = vi.fn();

    TestBed.configureTestingModule({
      imports: [NotificationOnboardingDialogComponent],
      providers: [
        provideAnimationsAsync(),
        {
          provide: NotificationOnboardingService,
          useValue: { state, accept, dismiss, close },
        },
        ...provideI18nTesting(),
      ],
    });
    const fixture = TestBed.createComponent(NotificationOnboardingDialogComponent);
    fixture.detectChanges();
    return { fixture };
  }

  // The `<p-dialog>` host element stays in the component template at
  // all times — PrimeNG mounts the actual mask + content surface into
  // a body-level portal only while `[visible]` is true. So we assert
  // visibility via the portal content (data-cy on the body element),
  // not on the host. The host being present in the DOM is meaningless
  // for this assertion.
  function dialogBodyVisible(): boolean {
    return document.querySelector('[data-cy="notification-onboarding-body"]') !== null;
  }
  function dialogResultVisible(): boolean {
    return document.querySelector('[data-cy="notification-onboarding-result"]') !== null;
  }

  afterEach(() => {
    // Clean up any portal-rendered dialog content between tests.
    document.body.querySelectorAll('.p-dialog-mask, .p-dialog').forEach((el) => el.remove());
  });

  it('renders no body or result content when state is idle', () => {
    setup();
    expect(dialogBodyVisible()).toBe(false);
    expect(dialogResultVisible()).toBe(false);
  });

  it('renders the pre-action body when state flips to visible', () => {
    const { fixture } = setup();
    state.set('visible');
    fixture.detectChanges();

    const body = document.querySelector('[data-cy="notification-onboarding-body"]');
    expect(body).not.toBeNull();
    expect(body!.textContent).toContain('this device');
  });

  it('calls accept when the user clicks Enable', async () => {
    const { fixture } = setup();
    state.set('visible');
    fixture.detectChanges();

    const acceptBtn = document.querySelector<HTMLButtonElement>(
      '[data-cy="notification-onboarding-accept"] button',
    );
    expect(acceptBtn).not.toBeNull();
    acceptBtn!.click();

    expect(accept).toHaveBeenCalled();
  });

  it('calls dismiss when the user clicks Not now', () => {
    const { fixture } = setup();
    state.set('visible');
    fixture.detectChanges();

    const dismissBtn = document.querySelector<HTMLButtonElement>(
      '[data-cy="notification-onboarding-dismiss"] button',
    );
    expect(dismissBtn).not.toBeNull();
    dismissBtn!.click();

    expect(dismiss).toHaveBeenCalled();
  });

  it('renders the success result banner when state is succeeded', () => {
    const { fixture } = setup();
    state.set('succeeded');
    fixture.detectChanges();

    const result = document.querySelector('[data-cy="notification-onboarding-result"]');
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain("We'll start sending notifications");
  });

  it('renders the denied result banner when the user blocked the OS prompt', () => {
    const { fixture } = setup();
    state.set('denied');
    fixture.detectChanges();

    const result = document.querySelector('[data-cy="notification-onboarding-result"]');
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain('No problem');
  });

  it('calls close on the Got it button after a result', () => {
    const { fixture } = setup();
    state.set('succeeded');
    fixture.detectChanges();

    const closeBtn = document.querySelector<HTMLButtonElement>(
      '[data-cy="notification-onboarding-close"] button',
    );
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();

    expect(close).toHaveBeenCalled();
  });
});
