import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { BackupInspection, DeviceService } from '../../core/mobile/device.service';
import { PcBackup } from '../../core/mobile/pc-backups';
import { DRIVE_AUTH, PC_BACKUPS, PHP_SERVER } from '../../core/mobile/shell-plugins';
import { AuthResponse, AuthService } from '../../core/services/auth.service';
import { RemoteError } from '../../core/sync/remote';
import { DoorComponent } from './door.component';

/**
 * The phone's door (#2079): «Accedi con Google», and the gym the PC put on
 * Drive comes back by itself; never over one the phone holds without asking.
 */

const KAIZEN = { name: 'Kaizen', athletes: 3, belts: { white: 2, blue: 1 } };
const PROVA = { name: 'Prova', athletes: 1, belts: { white: 1 } };
const SESSION = { token: 'owner-token', data: { id: 1 } } as unknown as AuthResponse;

function inspection(here: typeof PROVA | null = null): BackupInspection {
  return {
    backup: { taken_at: '2026-10-01T16:51:32.000Z', app_version: '2.74.1', academy: KAIZEN },
    here,
  };
}

function unreadable(): HttpErrorResponse {
  return new HttpErrorResponse({ status: 422, error: { code: 'unreadable', message: 'no' } });
}

interface Setup {
  backups?: PcBackup[];
  inspect?: DeviceService['inspect'];
  session?: DeviceService['session'];
  authorize?: () => Promise<{ accessToken: string }>;
  account?: (token: () => Promise<string>) => Promise<string | null>;
}

function setup(options: Setup = {}) {
  const backups = options.backups ?? [{ id: 'b2', name: 'budojo-backup-20261001-165132.zip' }];
  const reader = {
    token: async (): Promise<string> => '',
    account: vi.fn(async () =>
      (options.account ?? (async (token) => (await token()) && 'mario@gmail.com'))(reader.token),
    ),
    newestFirst: vi.fn(async () => backups),
    download: vi.fn(async (backup: PcBackup) => new TextEncoder().encode(`zip of ${backup.id}`)),
  };
  const device = {
    inspect: vi.fn(options.inspect ?? (() => of({ data: inspection() }))),
    restore: vi.fn<(archive: File) => Observable<void>>(() => of(undefined)),
    session: vi.fn(options.session ?? (() => of(SESSION))),
  };
  const server = {
    start: vi.fn(),
    restart: vi.fn(async () => ({ port: 50001, shellSecret: 's' })),
  };
  const drive = {
    authorize: vi.fn(options.authorize ?? (async () => ({ accessToken: 'google-token' }))),
    clearToken: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    imports: [DoorComponent],
    providers: [
      provideRouter([
        { path: 'dashboard', children: [] },
        { path: 'auth/register', children: [] },
      ]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: DeviceService, useValue: device },
      { provide: PHP_SERVER, useValue: server },
      { provide: DRIVE_AUTH, useValue: drive },
      {
        provide: PC_BACKUPS,
        useValue: (token: () => Promise<string>) => {
          reader.token = token;
          return reader;
        },
      },
    ],
  });
  const auth = TestBed.inject(AuthService);
  vi.spyOn(auth, 'adoptSession');
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigateByUrl');
  const fixture = TestBed.createComponent(DoorComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance;
  const el = fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();
  const cy = (name: string) => el.querySelector(`[data-cy="${name}"]`);
  return { component, el, render, cy, reader, device, server, drive, auth, router };
}

afterEach(() => {
  delete (window as { __BUDOJO_MOBILE__?: unknown }).__BUDOJO_MOBILE__;
  localStorage.removeItem('budojoRestoredBackup');
});

describe('the door on a phone that holds no academy', () => {
  it("brings back the PC's newest backup by itself, then opens the owner's session", async () => {
    const { component, device, server, auth, router, reader } = setup();

    await component.signInWithGoogle();

    expect(reader.download).toHaveBeenCalledWith({
      id: 'b2',
      name: 'budojo-backup-20261001-165132.zip',
    });
    const archive = device.restore.mock.calls[0][0];
    expect(archive).toBeInstanceOf(File);
    expect(archive.type).toBe('application/zip');
    expect(await archive.text()).toBe('zip of b2');
    expect(server.restart).toHaveBeenCalled();
    expect(auth.adoptSession).toHaveBeenCalledWith(SESSION);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('restarts only after the backup is staged, and opens the session only after the restart', async () => {
    const { component, device, server } = setup();
    const order: string[] = [];
    device.restore.mockImplementation(() => {
      order.push('restore');
      return of(undefined);
    });
    server.restart.mockImplementation(async () => {
      order.push('restart');
      return { port: 1, shellSecret: 's' };
    });
    device.session.mockImplementation(() => {
      order.push('session');
      return of(SESSION);
    });

    await component.signInWithGoogle();

    expect(order).toEqual(['restore', 'restart', 'session']);
  });

  it('tries the next backup when the newest does not open', async () => {
    const inspect = vi
      .fn()
      .mockReturnValueOnce(throwError(() => unreadable()))
      .mockReturnValueOnce(of({ data: inspection() }));
    const { component, reader, device } = setup({
      backups: [
        { id: 'new', name: 'budojo-backup-20261002-120000.zip' },
        { id: 'old', name: 'budojo-backup-20261001-165132.zip' },
      ],
      inspect,
    });

    await component.signInWithGoogle();

    expect(reader.download.mock.calls.map(([b]) => b.id)).toEqual(['new', 'old']);
    expect(await device.restore.mock.calls[0][0].text()).toBe('zip of old');
  });

  it('says whose Drive holds nothing, and offers to look again or start a gym', async () => {
    const { component, render, cy, device } = setup({ backups: [] });

    await component.signInWithGoogle();
    render();

    expect(cy('door-not-found')?.textContent).toContain('mario@gmail.com');
    expect(cy('door-retry')).not.toBeNull();
    expect(cy('door-not-found-without-google')?.textContent).toContain('Continue without Google');
    expect(device.restore).not.toHaveBeenCalled();
  });
});

describe('the door on a phone that holds an academy of its own', () => {
  it('names both and waits for the owner: nothing is replaced', async () => {
    const { component, render, cy, device, server } = setup({
      inspect: () => of({ data: inspection(PROVA) }),
    });

    await component.signInWithGoogle();
    render();

    expect(cy('door-academy-drive')?.textContent).toContain('Kaizen');
    expect(cy('door-academy-drive')?.textContent).toContain('3');
    expect(cy('door-academy-here')?.textContent).toContain('Prova');
    expect(device.restore).not.toHaveBeenCalled();
    expect(server.restart).not.toHaveBeenCalled();
  });

  it("brings Drive's in when the owner picks it", async () => {
    const { component, device, server, router } = setup({
      inspect: () => of({ data: inspection(PROVA) }),
    });
    await component.signInWithGoogle();

    await component.useDrive();

    expect(device.restore).toHaveBeenCalledTimes(1);
    expect(server.restart).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it("goes in on the phone's own when the owner keeps it", async () => {
    const { component, device, auth, router } = setup({
      inspect: () => of({ data: inspection(PROVA) }),
    });
    await component.signInWithGoogle();

    await component.keepHere();

    expect(device.restore).not.toHaveBeenCalled();
    expect(auth.adoptSession).toHaveBeenCalledWith(SESSION);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it("paints each academy's roster by belt, as wide as its athletes", async () => {
    const { component, render, cy } = setup({ inspect: () => of({ data: inspection(PROVA) }) });
    await component.signInWithGoogle();
    render();

    const bands = [
      ...(cy('door-academy-drive')?.querySelectorAll('.door__belts span') ?? []),
    ] as HTMLElement[];
    expect(bands.map((band) => band.style.flexGrow)).toEqual(['2', '1']);
    expect(bands[0].style.background).toContain('--budojo-belt-white');
  });
});

describe('when the door cannot go on', () => {
  it("goes back to the start when the owner closes Google's screen", async () => {
    const { component, render, cy, reader } = setup({
      authorize: async () => Promise.reject({ code: 'CANCELLED' }),
    });

    await component.signInWithGoogle();
    render();

    expect(cy('door-google')).not.toBeNull();
    expect(reader.newestFirst).not.toHaveBeenCalled();
  });

  it('says the internet is needed when Drive cannot be reached', async () => {
    const { component, render, cy } = setup({
      account: async () => Promise.reject(new RemoteError('offline', 'no network')),
    });

    await component.signInWithGoogle();
    render();

    expect(cy('door-failed')?.textContent).toContain('needs the internet');
  });

  it('asks for an update when the backup is from a newer Budojo', async () => {
    const newer = new HttpErrorResponse({
      status: 422,
      error: { code: 'newer', message: 'The database is from a newer Budojo (schema 2099_x).' },
    });
    const { component, render, cy, device } = setup({ inspect: () => throwError(() => newer) });

    await component.signInWithGoogle();
    render();

    expect(cy('door-failed')?.textContent).toContain('Update the app');
    // The server's own words, which name what is unknown: the screen is the only log.
    expect(cy('door-failed')?.textContent).toContain('schema 2099_x');
    expect(device.restore).not.toHaveBeenCalled();
  });
});

describe('what the door shows when something else fails', () => {
  it('keeps the address and the status of a server error, which the phone hides the text of', async () => {
    const crashed = new HttpErrorResponse({
      status: 500,
      statusText: 'Internal Server Error',
      url: 'http://127.0.0.1:41234/api/v1/device/backup/inspect',
      error: { message: 'Server Error' },
    });
    const { component, render, cy } = setup({ inspect: () => throwError(() => crashed) });

    await component.signInWithGoogle();
    render();

    expect(cy('door-failed')?.textContent).toContain('/api/v1/device/backup/inspect');
    expect(cy('door-failed')?.textContent).toContain('500');
  });
});

describe('continuing without Google', () => {
  it('goes straight in on a phone that has an owner: no password on a local device', async () => {
    const { component, auth, router } = setup();

    await component.continueWithoutGoogle();

    expect(auth.adoptSession).toHaveBeenCalledWith(SESSION);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('starts a gym on a phone nobody has set up', async () => {
    const { component, router } = setup({
      session: () =>
        throwError(() => new HttpErrorResponse({ status: 404, error: { code: 'no_owner' } })),
    });

    await component.continueWithoutGoogle();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/register');
  });
});

describe('signing in again on a phone the door brought the gym to (PRD § 5.4)', () => {
  it('remembers which backup it brought back', async () => {
    const { component } = setup();

    await component.signInWithGoogle();

    expect(localStorage.getItem('budojoRestoredBackup')).toBe('budojo-backup-20261001-165132.zip');
  });

  it('goes straight in when Drive has nothing newer: what the phone recorded since is kept', async () => {
    localStorage.setItem('budojoRestoredBackup', 'budojo-backup-20261001-165132.zip');
    const { component, reader, device, router } = setup();

    await component.signInWithGoogle();

    expect(reader.download).not.toHaveBeenCalled();
    expect(device.restore).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it("offers the PC's newer backup, and goes in on the phone's own by default", async () => {
    localStorage.setItem('budojoRestoredBackup', 'budojo-backup-20260930-100000.zip');
    const { component, render, cy, device, server } = setup({
      inspect: () => of({ data: inspection(KAIZEN) }),
    });

    await component.signInWithGoogle();
    render();

    expect(cy('door-update')).not.toBeNull();
    expect(cy('door-keep-here')?.querySelector('button')?.className).not.toContain('outlined');
    expect(device.restore).not.toHaveBeenCalled();
    expect(server.restart).not.toHaveBeenCalled();
  });

  it("brings the newer backup in only on the owner's word", async () => {
    localStorage.setItem('budojoRestoredBackup', 'budojo-backup-20260930-100000.zip');
    const { component, device } = setup({ inspect: () => of({ data: inspection(KAIZEN) }) });
    await component.signInWithGoogle();

    await component.useDrive();

    expect(device.restore).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('budojoRestoredBackup')).toBe('budojo-backup-20261001-165132.zip');
  });

  it("never offers an older backup as newer: when the newest does not open, the phone's own goes in", async () => {
    localStorage.setItem('budojoRestoredBackup', 'budojo-backup-20261001-165132.zip');
    const inspect = vi
      .fn()
      .mockReturnValueOnce(throwError(() => unreadable()))
      .mockReturnValueOnce(of({ data: inspection(KAIZEN) }));
    const { component, device, router } = setup({
      backups: [
        { id: 'new', name: 'budojo-backup-20261002-120000.zip' },
        { id: 'marked', name: 'budojo-backup-20261001-165132.zip' },
      ],
      inspect,
    });

    await component.signInWithGoogle();

    expect(device.restore).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('restores as on a new phone when the remembered phone has no owner any more', async () => {
    localStorage.setItem('budojoRestoredBackup', 'budojo-backup-20261001-165132.zip');
    const noOwner = new HttpErrorResponse({ status: 404, error: { code: 'no_owner' } });
    const session = vi
      .fn()
      .mockReturnValueOnce(throwError(() => noOwner))
      .mockReturnValueOnce(of(SESSION));
    const { component, device } = setup({ session });

    await component.signInWithGoogle();

    expect(device.restore).toHaveBeenCalledTimes(1);
  });
});

describe('a token Drive refuses', () => {
  it('is dropped, so «Try again» asks Google for a new one', async () => {
    const { component, drive } = setup({
      authorize: async () => ({ accessToken: 'stale-token' }),
      account: async (token) => {
        await token();
        throw new RemoteError('unauthorized', 'refused');
      },
    });

    await component.signInWithGoogle();

    expect(drive.clearToken).toHaveBeenCalledWith({ token: 'stale-token' });
  });
});

describe('a step that replaces the button that had focus', () => {
  it('takes the focus, so a screen reader reads it', async () => {
    const { component, render, el } = setup({ inspect: () => of({ data: inspection(PROVA) }) });

    await component.signInWithGoogle();
    render();
    await new Promise((resolve) => setTimeout(resolve));

    expect(document.activeElement).toBe(el.querySelector('.door__step'));
  });
});
