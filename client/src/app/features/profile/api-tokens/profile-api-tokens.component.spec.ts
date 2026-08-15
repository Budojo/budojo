import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Observable, of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import {
  ApiToken,
  ApiTokenService,
  CreatedApiToken,
} from '../../../core/services/api-token.service';
import { ProfileApiTokensComponent } from './profile-api-tokens.component';

/**
 * Tests for the API tokens panel (#431, #588 follow-up). Covers the
 * three render states (loading / empty / list), the create-then-
 * plaintext dialog flow, and the confirm-revoke gate.
 */
describe('ProfileApiTokensComponent (#588)', () => {
  let fixture: ComponentFixture<ProfileApiTokensComponent>;
  let service: ApiTokenService;

  function makeToken(overrides: Partial<ApiToken> = {}): ApiToken {
    return {
      id: 1,
      name: 'CI bot',
      abilities: ['read'],
      last_used_at: null,
      created_at: '2026-05-01T00:00:00Z',
      expires_at: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileApiTokensComponent],
      providers: [
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        MessageService,
      ],
    });
    fixture = TestBed.createComponent(ProfileApiTokensComponent);
    service = TestBed.inject(ApiTokenService);
  });

  it('renders the loading state on first paint before list resolves', () => {
    // Never-resolving Observable stand-in keeps `loading()` true through
    // the assertion.
    vi.spyOn(service, 'list').mockReturnValue(new Observable(() => undefined));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-api-tokens-loading"]'),
    ).not.toBeNull();
  });

  it('renders the empty state when the user has zero tokens', () => {
    vi.spyOn(service, 'list').mockReturnValue(of({ tokens: [], availableAbilities: ['read'] }));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-api-tokens-empty"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="profile-api-tokens-list"]')).toBeNull();
  });

  it('renders the error state when the list fetch fails', () => {
    vi.spyOn(service, 'list').mockReturnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-api-tokens-error"]'),
    ).not.toBeNull();
  });

  it('renders one row per token with the revoke affordance', () => {
    vi.spyOn(service, 'list').mockReturnValue(
      of({
        tokens: [makeToken({ id: 7, name: 'Mobile app' }), makeToken({ id: 9, name: 'Webhook' })],
        availableAbilities: ['read', 'write'],
      }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-cy="profile-api-token-row-7"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-api-token-row-9"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-api-token-revoke-7"]')).not.toBeNull();
  });

  it('uses the shared confirm-destructive button for the revoke affordance (#1033)', () => {
    vi.spyOn(service, 'list').mockReturnValue(
      of({ tokens: [makeToken({ id: 7 })], availableAbilities: ['read'] }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-confirm-destructive-button')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-api-token-revoke-7"]')).not.toBeNull();
  });

  it('confirms before revoking; removes the row + success toast on confirm', () => {
    vi.spyOn(service, 'list').mockReturnValue(
      of({ tokens: [makeToken({ id: 7 })], availableAbilities: ['read'] }),
    );
    vi.spyOn(service, 'revoke').mockReturnValue(of(true));
    const messageSpy = vi.spyOn(TestBed.inject(MessageService), 'add');
    fixture.detectChanges();
    // The component declares ConfirmationService in its own `providers:
    // [...]`, so pull it from the component element injector — TestBed's
    // module injector doesn't have it (returns null).
    const confirmService = fixture.debugElement.injector.get(ConfirmationService);
    // The confirmation popup is short-circuited: simulate the user
    // clicking "Yes, revoke" by firing the accept handler immediately.
    vi.spyOn(confirmService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmService;
    });

    const revokeBtn = fixture.debugElement.query(By.css('[data-cy="profile-api-token-revoke-7"]'));
    revokeBtn.triggerEventHandler('onClick', new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="profile-api-token-row-7"]')).toBeNull();
    expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('opens the plaintext dialog after a successful create', () => {
    vi.spyOn(service, 'list').mockReturnValue(
      of({ tokens: [], availableAbilities: ['read', 'write'] }),
    );
    const created: CreatedApiToken = {
      ...makeToken({ id: 11, name: 'Newly minted', abilities: ['read'] }),
      plain_text_token: 'plain-bearer-string',
    };
    vi.spyOn(service, 'create').mockReturnValue(of(created));
    fixture.detectChanges();

    const cmp = fixture.componentInstance as unknown as {
      openCreateDialog(): void;
      submitCreate(): void;
      createForm: {
        controls: {
          name: { setValue(v: string): void };
          abilities: { at(i: number): { setValue(v: boolean): void } };
        };
      };
    };
    cmp.openCreateDialog();
    cmp.createForm.controls.name.setValue('Newly minted');
    // Tick the first ability on so the form passes the abilities-
    // required server-side gate.
    cmp.createForm.controls.abilities.at(0).setValue(true);
    cmp.submitCreate();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-api-tokens-plaintext-dialog"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-api-tokens-plaintext"]')?.textContent,
    ).toContain('plain-bearer-string');
  });

  it('surfaces an error toast when create with no abilities selected', () => {
    vi.spyOn(service, 'list').mockReturnValue(of({ tokens: [], availableAbilities: ['read'] }));
    const messageSpy = vi.spyOn(TestBed.inject(MessageService), 'add');
    fixture.detectChanges();

    const cmp = fixture.componentInstance as unknown as {
      openCreateDialog(): void;
      submitCreate(): void;
      createForm: { controls: { name: { setValue(v: string): void } } };
    };
    cmp.openCreateDialog();
    cmp.createForm.controls.name.setValue('Missing abilities');
    cmp.submitCreate();

    expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});
