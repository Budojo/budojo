import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { AvatarCardComponent } from './avatar-card.component';
import { AuthService, User } from '../../../core/services/auth.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

const FAKE_USER: User = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Bonanno',
  full_name: 'Mario Bonanno',
  handle: null,
  email: 'mario@example.com',
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
};

function setup(
  authOverrides: Partial<AuthService> = {},
  userOverride?: User | null,
): {
  fixture: ComponentFixture<AvatarCardComponent>;
  cmp: AvatarCardComponent;
  authStub: Partial<AuthService>;
} {
  const userSignal = signal<User | null>(userOverride !== undefined ? userOverride : FAKE_USER);
  const authStub: Partial<AuthService> = {
    user: userSignal,
    uploadAvatar: vi.fn(() =>
      of({ ...FAKE_USER, avatar_url: '/storage/users/avatars/1.png?v=1700000000' }),
    ),
    removeAvatar: vi.fn(() => of({ ...FAKE_USER, avatar_url: null })),
    ...authOverrides,
  };

  TestBed.configureTestingModule({
    imports: [AvatarCardComponent],
    providers: [
      { provide: AuthService, useValue: authStub },
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideI18nTesting(),
      MessageService,
      ConfirmationService,
    ],
  });
  const fixture = TestBed.createComponent(AvatarCardComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, authStub };
}

// jsdom doesn't ship File constructors with type/size that pass MIME +
// size checks out of the box. Tiny helper keeps the validation logic
// exercised end-to-end.
function makeFile(opts: { type?: string; size?: number } = {}): File {
  const type = opts.type ?? 'image/png';
  const size = opts.size ?? 1024;
  const bytes = new Uint8Array(size);
  return new File([bytes], 'avatar.png', { type });
}

function fireSelect(cmp: AvatarCardComponent, file: File): void {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => [file] as unknown as FileList,
  });
  // Access the protected method via index-string syntax — the spec
  // exercises the same boundary the template's (change) binding does.
  (cmp as unknown as { onAvatarSelected(e: Event): void }).onAvatarSelected({
    target: input,
  } as unknown as Event);
}

describe('AvatarCardComponent', () => {
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

    // Access the protected signal via index-string syntax — the spec
    // verifies the boundary the template's [loading] binding observes.
    const readUploading = () =>
      (cmp as unknown as { avatarUploading: () => boolean }).avatarUploading();

    expect(readUploading()).toBe(false);
    fireSelect(cmp, makeFile({ type: 'image/png', size: 100 * 1024 }));
    expect(readUploading()).toBe(true);

    subject.next({ ...FAKE_USER, avatar_url: '/storage/users/avatars/1.jpg' });
    subject.complete();
    expect(readUploading()).toBe(false);
  });
});
