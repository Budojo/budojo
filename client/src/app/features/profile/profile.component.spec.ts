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
  avatar_url: null,
};

function setup(authOverrides: Partial<AuthService> = {}, userOverride?: User | null) {
  const userSignal = signal<User | null>(userOverride !== undefined ? userOverride : FAKE_USER);
  const authStub: Partial<AuthService> = {
    user: userSignal,
    isEmailVerified: signal<boolean>(true) as never,
    exportMyData: vi.fn(() => of({ blob: new Blob(['ok']), filename: 'budojo-export.zip' })),
    uploadAvatar: vi.fn(() => of({ ...FAKE_USER, avatar_url: '/storage/users/avatars/1.jpg' })),
    removeAvatar: vi.fn(() => of({ ...FAKE_USER, avatar_url: null })),
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
  return { fixture, cmp: fixture.componentInstance, authStub, userSignal };
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

describe('ProfileComponent — avatar upload (#411)', () => {
  // jsdom doesn't ship `File` constructors with type / size that pass our
  // MIME / size checks out of the box. A small helper keeps the specs
  // readable AND keeps the validation logic exercised end-to-end.
  function makeFile(opts: { type?: string; size?: number } = {}): File {
    const type = opts.type ?? 'image/png';
    const size = opts.size ?? 1024;
    const bytes = new Uint8Array(size);
    return new File([bytes], 'avatar.png', { type });
  }

  function fireSelect(cmp: ProfileComponent, file: File): void {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => [file] as unknown as FileList,
    });
    cmp['onAvatarSelected']({ target: input } as unknown as Event);
  }

  it('renders the upload button with the Upload label when no avatar is set', () => {
    const { fixture } = setup();
    const btn = fixture.nativeElement.querySelector(
      '[data-cy="profile-avatar-upload"]',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Upload');
    expect(fixture.nativeElement.querySelector('[data-cy="profile-avatar-remove"]')).toBeNull();
  });

  it('renders Replace + Remove when avatar_url is set on the cached user', () => {
    const { fixture } = setup({}, {
      ...FAKE_USER,
      avatar_url: '/storage/users/avatars/1.jpg',
    } as User);
    const upload = fixture.nativeElement.querySelector(
      '[data-cy="profile-avatar-upload"]',
    ) as HTMLButtonElement;
    expect(upload.textContent).toContain('Replace');
    expect(fixture.nativeElement.querySelector('[data-cy="profile-avatar-remove"]')).not.toBeNull();
  });

  it('on a valid file: calls authService.uploadAvatar and surfaces a success toast', () => {
    const messageSpy = vi.fn();
    const { cmp, authStub } = setup();
    const messageService = TestBed.inject(MessageService);
    messageService.add = messageSpy;

    fireSelect(cmp, makeFile({ type: 'image/png', size: 100 * 1024 }));

    expect(authStub.uploadAvatar).toHaveBeenCalledTimes(1);
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        summary: expect.stringContaining('updated'),
      }),
    );
  });

  it('rejects oversized files with an error toast and no upload call', () => {
    const messageSpy = vi.fn();
    const { cmp, authStub } = setup();
    const messageService = TestBed.inject(MessageService);
    messageService.add = messageSpy;

    fireSelect(cmp, makeFile({ type: 'image/png', size: 3 * 1024 * 1024 }));

    expect(authStub.uploadAvatar).not.toHaveBeenCalled();
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: expect.stringContaining('too large'),
      }),
    );
  });

  it('rejects unsupported MIME types with an error toast and no upload call', () => {
    const messageSpy = vi.fn();
    const { cmp, authStub } = setup();
    const messageService = TestBed.inject(MessageService);
    messageService.add = messageSpy;

    fireSelect(cmp, makeFile({ type: 'application/pdf', size: 100 }));

    expect(authStub.uploadAvatar).not.toHaveBeenCalled();
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: expect.stringContaining('Unsupported'),
      }),
    );
  });

  it('shows an error toast when the upload request fails', () => {
    const messageSpy = vi.fn();
    const { cmp } = setup({
      uploadAvatar: vi.fn(() => throwError(() => ({ status: 500 }))) as never,
    });
    const messageService = TestBed.inject(MessageService);
    messageService.add = messageSpy;

    fireSelect(cmp, makeFile({ type: 'image/png', size: 100 * 1024 }));

    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: expect.stringContaining('Upload failed'),
      }),
    );
  });

  it('toggles `avatarUploading` while the request is in flight', () => {
    const subject = new Subject<User>();
    const { cmp } = setup({
      uploadAvatar: vi.fn(() => subject.asObservable()) as never,
    });

    expect(cmp['avatarUploading']()).toBe(false);
    fireSelect(cmp, makeFile({ type: 'image/png', size: 100 * 1024 }));
    expect(cmp['avatarUploading']()).toBe(true);

    subject.next({ ...FAKE_USER, avatar_url: '/storage/users/avatars/1.jpg' });
    subject.complete();
    expect(cmp['avatarUploading']()).toBe(false);
  });
});
