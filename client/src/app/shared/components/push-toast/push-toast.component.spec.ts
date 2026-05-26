import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { PushToastComponent } from './push-toast.component';

interface ToastMessage {
  data?: { link?: string; kind?: string };
}

describe('PushToastComponent (#1063)', () => {
  function setup() {
    const navigateByUrl = vi.fn();
    TestBed.configureTestingModule({
      imports: [PushToastComponent],
      providers: [
        provideAnimationsAsync(),
        ...provideI18nTesting(),
        // Real MessageService so <p-toast> can subscribe to its
        // messageObserver (a mock without it crashes change detection);
        // spy on clear() to assert dismissal.
        MessageService,
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    const fixture = TestBed.createComponent(PushToastComponent);
    const clear = vi.spyOn(TestBed.inject(MessageService), 'clear');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, navigateByUrl, clear };
  }

  it('uses the dedicated "push" toast key so only push messages render here', () => {
    const { component } = setup();
    expect(component.key).toBe('push');
  });

  it('navigates to data.link and clears the push toast on click', () => {
    const { component, navigateByUrl, clear } = setup();
    component.onClick({ data: { link: '/dashboard/me/feed#post-7' } } as ToastMessage);

    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard/me/feed#post-7');
    expect(clear).toHaveBeenCalledWith('push');
  });

  it('clears (without navigating) when the clicked message has no link', () => {
    const { component, navigateByUrl, clear } = setup();
    component.onClick({ data: {} } as ToastMessage);

    expect(navigateByUrl).not.toHaveBeenCalled();
    // No link → tapping the toast still dismisses it (Norman § feedback:
    // a tap must DO something; here it acknowledges/dismisses).
    expect(clear).toHaveBeenCalledWith('push');
  });

  it('dismiss() clears the push toast and stops the click bubbling to the body handler', () => {
    const { component, navigateByUrl, clear } = setup();
    const event = { stopPropagation: vi.fn() } as unknown as MouseEvent;
    component.dismiss(event);

    expect(event.stopPropagation as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith('push');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('keyboard-dismissing the × does NOT deep-link (#1064 reviewer wiring)', async () => {
    const { fixture, navigateByUrl } = setup();
    const messageService = TestBed.inject(MessageService);

    // Render a real push toast with a link, then drive the close button
    // by keyboard. The card's (keydown.enter) must NOT fire — the close
    // button's keydown.enter stopPropagation has to win.
    messageService.add({
      key: 'push',
      severity: 'info',
      summary: 'New comment',
      data: { link: '/dashboard/me/feed#post-9' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const closeBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="push-toast-dismiss"]',
    ) as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();

    closeBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
