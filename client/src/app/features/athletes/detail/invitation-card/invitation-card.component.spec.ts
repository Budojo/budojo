import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { InvitationCardComponent } from './invitation-card.component';
import {
  Athlete,
  AthleteInvitation,
  AthleteService,
} from '../../../../core/services/athlete.service';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';

const BASE_ATHLETE: Athlete = {
  id: 7,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: null,
  phone_national_number: null,
  date_of_birth: null,
  belt: 'white',
  stripes: 0,
  status: 'active',
  joined_at: '2026-01-01',
  address: null,
  created_at: '2026-01-01T00:00:00Z',
  paid_current_month: false,
  invitation: null,
};

const PENDING_INVITATION: AthleteInvitation = {
  id: 11,
  athlete_id: 7,
  email: 'mario@example.com',
  expires_at: '2026-05-13T10:00:00Z',
  accepted_at: null,
  revoked_at: null,
  last_sent_at: '2026-05-06T10:00:00Z',
  state: 'pending',
};

function setup(
  athleteOverride: Partial<Athlete> = {},
  serviceOverrides: Partial<AthleteService> = {},
) {
  const athlete: Athlete = { ...BASE_ATHLETE, ...athleteOverride };
  const serviceStub: Partial<AthleteService> = {
    invite: vi.fn(() => of(PENDING_INVITATION)),
    resendInvite: vi.fn(() => of({ ...PENDING_INVITATION, last_sent_at: '2026-05-06T11:00:00Z' })),
    revokeInvite: vi.fn(() => of(undefined)),
    ...serviceOverrides,
  };

  TestBed.configureTestingModule({
    imports: [InvitationCardComponent],
    providers: [
      { provide: AthleteService, useValue: serviceStub },
      MessageService,
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(InvitationCardComponent);
  fixture.componentRef.setInput('athlete', athlete);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, serviceStub };
}

describe('InvitationCardComponent — empty state (#467)', () => {
  it('renders the empty hint + Invite button when athlete has email and no invitation', () => {
    const { fixture } = setup();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-card"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-invite"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-pending"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-accepted"]'),
    ).toBeNull();
  });

  it('renders the no-email hint and hides the Invite button when athlete has no email', () => {
    const { fixture } = setup({ email: null });
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-no-email"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-invitation-invite"]')).toBeNull();
  });

  it('treats whitespace-only email as no-email', () => {
    const { fixture } = setup({ email: '   ' });
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-no-email"]'),
    ).not.toBeNull();
  });
});

describe('InvitationCardComponent — invite action (#467)', () => {
  it('on success: calls service.invite, flips to pending state, and toasts', () => {
    const messageSpy = vi.fn();
    const { cmp, fixture, serviceStub } = setup();
    TestBed.inject(MessageService).add = messageSpy;

    cmp.invite();
    fixture.detectChanges();

    expect(serviceStub.invite).toHaveBeenCalledWith(7);
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-pending"]'),
    ).not.toBeNull();
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: expect.stringContaining('sent') }),
    );
  });

  it('toggles `sending` while the request is in flight', () => {
    const subject = new Subject<AthleteInvitation>();
    const { cmp } = setup({}, { invite: vi.fn(() => subject.asObservable()) as never });

    expect(cmp['sending']()).toBe(false);
    cmp.invite();
    expect(cmp['sending']()).toBe(true);

    subject.next(PENDING_INVITATION);
    subject.complete();
    expect(cmp['sending']()).toBe(false);
  });

  it('on 422 with errors.email_already_registered: surfaces the dedicated detail toast', () => {
    const messageSpy = vi.fn();
    const error = {
      status: 422,
      error: { errors: { email_already_registered: ['That email is already a user.'] } },
    };
    const { cmp } = setup({}, { invite: vi.fn(() => throwError(() => error)) as never });
    TestBed.inject(MessageService).add = messageSpy;

    cmp.invite();

    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: expect.stringContaining('Budojo'),
      }),
    );
  });

  it('on a generic error: surfaces the fallback detail toast', () => {
    const messageSpy = vi.fn();
    const { cmp } = setup(
      {},
      { invite: vi.fn(() => throwError(() => ({ status: 500 }))) as never },
    );
    TestBed.inject(MessageService).add = messageSpy;

    cmp.invite();

    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: expect.stringContaining('went wrong'),
      }),
    );
  });

  it('ignores subsequent clicks while a request is in flight', () => {
    const subject = new Subject<AthleteInvitation>();
    const inviteSpy = vi.fn(() => subject.asObservable());
    const { cmp } = setup({}, { invite: inviteSpy as never });

    cmp.invite();
    cmp.invite();
    cmp.invite();

    expect(inviteSpy).toHaveBeenCalledTimes(1);
  });
});

describe('InvitationCardComponent — pending state (#467)', () => {
  it('renders the pending chip + resend + revoke buttons when invitation is pending', () => {
    const { fixture } = setup({
      invitation: {
        id: 11,
        state: 'pending',
        sent_at: '2026-05-06T10:00:00Z',
        expires_at: '2026-05-13T10:00:00Z',
        accepted_at: null,
      },
    });
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-pending"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-resend"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-revoke"]'),
    ).not.toBeNull();
  });

  it('resend: calls service.resendInvite and toasts on success', () => {
    const messageSpy = vi.fn();
    const { cmp, serviceStub } = setup({
      invitation: {
        id: 11,
        state: 'pending',
        sent_at: '2026-05-06T10:00:00Z',
        expires_at: '2026-05-13T10:00:00Z',
        accepted_at: null,
      },
    });
    TestBed.inject(MessageService).add = messageSpy;

    cmp.resend();

    expect(serviceStub.resendInvite).toHaveBeenCalledWith(7);
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: expect.stringContaining('re-sent') }),
    );
  });

  it('revoke direct: calls service.revokeInvite, returns to empty state, toasts', () => {
    const messageSpy = vi.fn();
    const { cmp, fixture, serviceStub } = setup({
      invitation: {
        id: 11,
        state: 'pending',
        sent_at: '2026-05-06T10:00:00Z',
        expires_at: '2026-05-13T10:00:00Z',
        accepted_at: null,
      },
    });
    TestBed.inject(MessageService).add = messageSpy;

    cmp['revoke']();
    fixture.detectChanges();

    expect(serviceStub.revokeInvite).toHaveBeenCalledWith(7, 11);
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-pending"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-invite"]'),
    ).not.toBeNull();
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: expect.stringContaining('revoked') }),
    );
  });
});

describe('InvitationCardComponent — accepted state (#467)', () => {
  it('renders the accepted chip and no actions', () => {
    const { fixture } = setup({
      invitation: {
        id: 11,
        state: 'accepted',
        sent_at: '2026-05-06T10:00:00Z',
        expires_at: '2026-05-13T10:00:00Z',
        accepted_at: '2026-05-07T10:00:00Z',
      },
    });
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-invitation-accepted"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-invitation-resend"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-invitation-revoke"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-invitation-invite"]')).toBeNull();
  });
});
