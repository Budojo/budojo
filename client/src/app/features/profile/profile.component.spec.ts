import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { AuthService, User } from '../../core/services/auth.service';
import { MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

const FAKE_USER: User = {
  id: 1,
  name: 'Tester',
  email: 'tester@example.com',
  email_verified_at: '2026-01-01T00:00:00Z',
};

function setup(authOverrides: Partial<AuthService> = {}) {
  const userSignal = signal<User | null>(FAKE_USER);
  const authStub: Partial<AuthService> = {
    user: userSignal,
    isEmailVerified: signal<boolean>(true) as never,
    exportMyData: vi.fn(() => of({ blob: new Blob(['ok']), filename: 'budojo-export.zip' })),
    ...authOverrides,
  };

  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [
      { provide: AuthService, useValue: authStub },
      // ProfileComponent reads the app-level `MessageService` from the
      // root injector (no component-level provider) — provide it here.
      MessageService,
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}) },
        },
      },
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, authStub };
}

describe('ProfileComponent — data export (#222)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  it('renders the export button when the user is loaded', () => {
    const { fixture } = setup();
    const button = fixture.nativeElement.querySelector('[data-cy="profile-export-data"]');
    expect(button).not.toBeNull();
  });

  it('on click: calls authService.exportMyData("zip") and triggers a download', () => {
    const { cmp, authStub } = setup();

    cmp.exportMyData();

    expect(authStub.exportMyData).toHaveBeenCalledWith('zip');
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('toggles `exporting` while the request is in flight', () => {
    const subject = new Subject<{ blob: Blob; filename: string }>();
    const { cmp } = setup({
      exportMyData: vi.fn(() => subject.asObservable()),
    } as never);

    expect(cmp['exporting']()).toBe(false);
    cmp.exportMyData();
    expect(cmp['exporting']()).toBe(true);

    subject.next({ blob: new Blob(['ok']), filename: 'x.zip' });
    subject.complete();
    expect(cmp['exporting']()).toBe(false);
  });

  it('ignores subsequent clicks while a download is in flight (no double-call)', () => {
    const subject = new Subject<{ blob: Blob; filename: string }>();
    const exportMock = vi.fn(() => subject.asObservable());
    const { cmp } = setup({ exportMyData: exportMock } as never);

    cmp.exportMyData();
    cmp.exportMyData();
    cmp.exportMyData();

    expect(exportMock).toHaveBeenCalledTimes(1);
  });

  it('shows a 429 toast when the throttle limit is hit', () => {
    const messageSpy = vi.fn();
    const { cmp } = setup({
      exportMyData: vi.fn(() => throwError(() => ({ status: 429 }))),
    } as never);
    // ProfileComponent uses the app-level MessageService — TestBed.inject
    // resolves the same instance the component pulls from its injector.
    const messageService = TestBed.inject(MessageService);
    messageService.add = messageSpy;

    cmp.exportMyData();

    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: expect.stringContaining('a minute'),
      }),
    );
    expect(cmp['exporting']()).toBe(false);
  });
});
