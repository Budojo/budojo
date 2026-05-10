import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MessageService } from 'primeng/api';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ProfileNotificationsComponent } from './profile-notifications.component';

interface Harness {
  readonly fixture: ComponentFixture<ProfileNotificationsComponent>;
  readonly httpMock: HttpTestingController;
  readonly el: HTMLElement;
  readonly addToastSpy: ReturnType<typeof vi.fn>;
}

const ENDPOINT = '/api/v1/me/notification-preferences';
const MEDICAL = 'medical_cert_expiry_reminders';
const UNPAID = 'unpaid_athletes_digest';

function setup(): Harness {
  const addToastSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [ProfileNotificationsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: MessageService, useValue: { add: addToastSpy } },
    ],
  });
  const fixture = TestBed.createComponent(ProfileNotificationsComponent);
  fixture.detectChanges(); // ngOnInit
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
    addToastSpy,
  };
}

describe('ProfileNotificationsComponent (#416)', () => {
  it('renders loading panel before API responds', () => {
    const { el, httpMock } = setup();
    expect(el.querySelector('[data-cy="profile-notifications-loading"]')).not.toBeNull();
    httpMock.expectOne(ENDPOINT).flush({ data: {} });
  });

  it('renders one toggle per category + the "always sent" transactional block', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(ENDPOINT).flush({
      data: { [MEDICAL]: true, [UNPAID]: true },
    });
    fixture.detectChanges();

    expect(el.querySelector(`[data-cy="profile-notifications-row-${MEDICAL}"]`)).not.toBeNull();
    expect(el.querySelector(`[data-cy="profile-notifications-row-${UNPAID}"]`)).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-notifications-transactional"]')).not.toBeNull();
  });

  it('renders error panel + retry CTA on HTTP failure', () => {
    const { fixture, httpMock, el } = setup();
    httpMock
      .expectOne(ENDPOINT)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="profile-notifications-error"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-notifications-retry"]')).not.toBeNull();
  });

  it('PATCHes the diff on toggle and updates state from the echoed snapshot', () => {
    const { fixture, httpMock } = setup();
    httpMock.expectOne(ENDPOINT).flush({ data: { [MEDICAL]: true, [UNPAID]: true } });
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      onToggle: (cat: { key: string }, value: boolean) => void;
      isEnabled: (key: string) => boolean;
    };
    component.onToggle({ key: MEDICAL }, false);

    const req = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === ENDPOINT);
    expect(req.request.body).toEqual({ preferences: { [MEDICAL]: false } });
    req.flush({ data: { [MEDICAL]: false, [UNPAID]: true } });

    fixture.detectChanges();
    expect(component.isEnabled(MEDICAL)).toBe(false);
    expect(component.isEnabled(UNPAID)).toBe(true);
  });

  it('reverts the toggle and toasts an error on PATCH failure', () => {
    const { fixture, httpMock, addToastSpy } = setup();
    httpMock.expectOne(ENDPOINT).flush({ data: { [MEDICAL]: true, [UNPAID]: true } });
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      onToggle: (cat: { key: string }, value: boolean) => void;
      isEnabled: (key: string) => boolean;
    };
    component.onToggle({ key: MEDICAL }, false);

    httpMock
      .expectOne(ENDPOINT)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });

    fixture.detectChanges();
    // Reverted to the prior value.
    expect(component.isEnabled(MEDICAL)).toBe(true);
    expect(addToastSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});
