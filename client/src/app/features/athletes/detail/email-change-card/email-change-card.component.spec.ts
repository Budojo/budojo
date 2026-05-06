import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { EmailChangeCardComponent } from './email-change-card.component';
import {
  Athlete,
  AthleteEmailChangeMode,
  AthleteService,
} from '../../../../core/services/athlete.service';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';

const BASE_ATHLETE: Athlete = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'old@example.com',
  phone_country_code: null,
  phone_national_number: null,
  date_of_birth: null,
  belt: 'white',
  stripes: 0,
  status: 'active',
  joined_at: '2026-05-01',
  address: null,
  created_at: '2026-05-01T00:00:00Z',
};

function setup(
  opts: {
    athlete?: Partial<Athlete>;
    changeEmailResponse?: { mode: AthleteEmailChangeMode };
    changeEmailError?: { status?: number; error?: { errors?: Record<string, unknown> } };
    autoAccept?: boolean;
  } = {},
) {
  const changeEmail = vi.fn(() =>
    opts.changeEmailError
      ? throwError(() => opts.changeEmailError)
      : of(opts.changeEmailResponse ?? { mode: 'direct' as AthleteEmailChangeMode }),
  );
  const messageAdd = vi.fn();

  TestBed.configureTestingModule({
    imports: [EmailChangeCardComponent],
    providers: [
      { provide: AthleteService, useValue: { changeEmail } as Partial<AthleteService> },
      { provide: MessageService, useValue: { add: messageAdd } as Partial<MessageService> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(EmailChangeCardComponent);
  fixture.componentRef.setInput('athlete', { ...BASE_ATHLETE, ...opts.athlete });
  fixture.detectChanges();

  // Auto-accept / auto-reject the confirm dialog so the spec can drive
  // the flow synchronously.
  if (opts.autoAccept) {
    const confirm = (
      fixture.componentInstance as unknown as {
        confirmationService: ConfirmationService;
      }
    ).confirmationService;
    confirm.confirm = vi.fn((cfg: { accept?: () => void }) => {
      cfg.accept?.();
      return confirm;
    }) as never;
  }

  return { fixture, cmp: fixture.componentInstance, changeEmail, messageAdd };
}

describe('EmailChangeCardComponent (#476)', () => {
  it('state A: direct edit skips confirm and toasts on success', () => {
    const { cmp, changeEmail, messageAdd } = setup({
      athlete: { invitation: null },
      changeEmailResponse: { mode: 'direct' },
    });

    cmp.startEdit();
    cmp['form'].patchValue({ email: 'new@example.com' });
    cmp.submit();

    expect(changeEmail).toHaveBeenCalledWith(42, 'new@example.com');
    expect(messageAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('state B: pencil → confirm → invite_swap toast (after auto-accept)', () => {
    const { cmp, changeEmail, messageAdd } = setup({
      athlete: {
        invitation: {
          id: 99,
          state: 'pending',
          sent_at: '2026-05-01T00:00:00Z',
          expires_at: '2026-05-08T00:00:00Z',
          accepted_at: null,
        },
      },
      changeEmailResponse: { mode: 'invite_swap' },
      autoAccept: true,
    });

    cmp.startEdit();
    cmp['form'].patchValue({ email: 'new@example.com' });
    cmp.submit();

    expect(changeEmail).toHaveBeenCalledWith(42, 'new@example.com');
    expect(messageAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('state C: pencil → confirm → pending toast (no athlete refetch emitted)', () => {
    const emitted = vi.fn();
    const { cmp, changeEmail, messageAdd, fixture } = setup({
      athlete: {
        invitation: {
          id: 100,
          state: 'accepted',
          sent_at: '2026-04-01T00:00:00Z',
          expires_at: '2026-04-08T00:00:00Z',
          accepted_at: '2026-04-02T00:00:00Z',
        },
      },
      changeEmailResponse: { mode: 'pending' },
      autoAccept: true,
    });
    fixture.componentInstance.athleteChanged.subscribe(() => emitted());

    cmp.startEdit();
    cmp['form'].patchValue({ email: 'new@example.com' });
    cmp.submit();

    expect(changeEmail).toHaveBeenCalled();
    expect(messageAdd).toHaveBeenCalled();
    // Pending mode: no refetch needed (live row hasn't moved yet).
    expect(emitted).not.toHaveBeenCalled();
  });

  it('surfaces email_taken inline on a 422 response', () => {
    const { cmp } = setup({
      athlete: { invitation: null },
      changeEmailError: {
        status: 422,
        error: { errors: { email: ['email_taken'] } },
      },
    });

    cmp.startEdit();
    cmp['form'].patchValue({ email: 'taken@example.com' });
    cmp.submit();

    expect(cmp['serverError']()).toBe('taken');
  });

  it('surfaces throttled inline on a 429 response', () => {
    const { cmp } = setup({
      athlete: { invitation: null },
      changeEmailError: { status: 429 },
    });

    cmp.startEdit();
    cmp['form'].patchValue({ email: 'new@example.com' });
    cmp.submit();

    expect(cmp['serverError']()).toBe('throttled');
  });
});
