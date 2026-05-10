import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { UnsubscribeComponent } from './unsubscribe.component';

interface HarnessOpts {
  readonly category?: string | null;
  readonly status?: string | null;
  readonly isLoggedIn?: boolean;
}

interface Harness {
  readonly fixture: ComponentFixture<UnsubscribeComponent>;
  readonly el: HTMLElement;
  readonly component: UnsubscribeComponent;
}

function setup(opts: HarnessOpts = {}): Harness {
  TestBed.configureTestingModule({
    imports: [UnsubscribeComponent],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (key: string): string | null => {
                if (key === 'category') return opts.category ?? null;
                if (key === 'status') return opts.status ?? null;
                return null;
              },
            },
          },
        },
      },
      {
        provide: AuthService,
        useValue: { isLoggedIn: signal<boolean>(opts.isLoggedIn ?? false) },
      },
    ],
  });
  const fixture = TestBed.createComponent(UnsubscribeComponent);
  fixture.detectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('UnsubscribeComponent (#417)', () => {
  it('renders the success panel for a known category', () => {
    const { el } = setup({ category: 'medical_cert_expiry_reminders' });
    expect(el.querySelector('[data-cy="unsubscribe-success"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="unsubscribe-invalid"]')).toBeNull();
  });

  it('renders the invalid panel when status=invalid', () => {
    const { el } = setup({ status: 'invalid' });
    expect(el.querySelector('[data-cy="unsubscribe-invalid"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="unsubscribe-success"]')).toBeNull();
  });

  it('renders the invalid panel for an unknown category (defensive)', () => {
    const { el } = setup({ category: 'totally_unknown_thing' });
    expect(el.querySelector('[data-cy="unsubscribe-invalid"]')).not.toBeNull();
  });

  it('renders the invalid panel when no params are present', () => {
    const { el } = setup();
    expect(el.querySelector('[data-cy="unsubscribe-invalid"]')).not.toBeNull();
  });

  it('CTA targets /auth/login for an unauthenticated visitor', () => {
    const { component } = setup({ category: 'medical_cert_expiry_reminders', isLoggedIn: false });
    expect(component['continueTarget']()).toBe('/auth/login');
  });

  it('CTA targets /dashboard/profile for a signed-in visitor', () => {
    const { component } = setup({ category: 'medical_cert_expiry_reminders', isLoggedIn: true });
    expect(component['continueTarget']()).toBe('/dashboard/profile');
  });
});
