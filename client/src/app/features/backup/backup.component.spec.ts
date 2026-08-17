import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { BackupComponent } from './backup.component';
import {
  DesktopBackupService,
  type BackupArchiveView,
} from '../../core/services/desktop-backup.service';
import { DesktopKeysService } from '../../core/services/desktop-keys.service';
import { DriveSyncService } from '../../core/services/drive-sync.service';
import { BackupFolderService } from '../../core/services/backup-folder.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

/**
 * Data & backup page (#1228): shows the last backup, backs up, restores with a
 * refusal surfaced.
 */
describe('BackupComponent', () => {
  const archives: BackupArchiveView[] = [
    {
      name: 'budojo-backup-20260815-090000.zip',
      createdAt: '2026-08-15T09:00:00Z',
      sizeBytes: 2_500_000,
    },
    {
      name: 'budojo-backup-20260814-090000.zip',
      createdAt: '2026-08-14T09:00:00Z',
      sizeBytes: 2_400_000,
    },
  ];

  function setup(
    overrides: Partial<DesktopBackupService> = {},
    keysOverrides: Partial<DesktopKeysService> = {},
    driveOverrides: Partial<DriveSyncService> = {},
    folderOverrides: Partial<BackupFolderService> = {},
  ) {
    const added: unknown[] = [];
    const backup: Partial<DesktopBackupService> = {
      list: vi.fn(async () => archives),
      backupNow: vi.fn(async () => true),
      restore: vi.fn(async () => ({ ok: true })),
      ...overrides,
    };
    // Default: the recovery-keys bridge is absent (like the web), so the section
    // is hidden and the pre-existing backup tests are untouched.
    const keys: Partial<DesktopKeysService> = {
      available: false,
      reveal: vi.fn(async () => ({ ok: true, code: 'BUDOJO-RECOVERY-1:abc' })),
      importCode: vi.fn(async () => ({ ok: true })),
      ...keysOverrides,
    };
    // Default: the Drive bridge is absent (like the web), so the card is hidden
    // and every pre-existing backup test is untouched.
    const drive: Partial<DriveSyncService> = {
      available: false,
      state: vi.fn(async () => ({ configured: false, linked: false })),
      archives: vi.fn(async () => []),
      link: vi.fn(async () => ({ ok: true, account: 'gym@example.it' })),
      unlink: vi.fn(async () => undefined),
      syncNow: vi.fn(async () => ({ ran: true, uploaded: 1 })),
      ...driveOverrides,
    };
    // Default: no folder bridge, like the web — the card is hidden and every
    // pre-existing test is untouched.
    const folder: Partial<BackupFolderService> = {
      available: false,
      state: vi.fn(async () => ({
        folder: null,
        lastCopyAt: null,
        lastError: null,
        lastErrorAt: null,
      })),
      choose: vi.fn(async () => ({ ok: false })),
      clear: vi.fn(async () => undefined),
      copyNow: vi.fn(async () => ({ ran: true, copied: 1 })),
      openFolder: vi.fn(async () => undefined),
      ...folderOverrides,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideI18nTesting(),
        MessageService, // real one: p-toast subscribes to its stream
        ConfirmationService, // confirm-destructive-button needs it
        { provide: DesktopBackupService, useValue: backup },
        { provide: DesktopKeysService, useValue: keys },
        { provide: DriveSyncService, useValue: drive },
        { provide: BackupFolderService, useValue: folder },
      ],
    });
    // Spy on add() so the assertions read the toasts without stubbing the
    // service p-toast needs.
    vi.spyOn(TestBed.inject(MessageService), 'add').mockImplementation((m) => added.push(m));
    const fixture = TestBed.createComponent(BackupComponent);
    fixture.detectChanges();
    return { fixture, backup, keys, drive, folder, added };
  }

  /**
   * The Drive calls sit behind the local list on purpose (the local archives
   * paint first), so they land a microtask later than `whenStable` alone
   * flushes. Settling twice is honest about that rather than sprinkling extra
   * awaits at each assertion.
   */
  async function settle(fixture: {
    whenStable(): Promise<unknown>;
    detectChanges(): void;
  }): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  it('shows the most recent backup time and the archive list', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="backup-last-at"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-cy="backup-list"] li')).toHaveLength(2);
  });

  it('shows the empty state when there are no backups', async () => {
    const { fixture } = setup({ list: vi.fn(async () => []) });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="backup-last-none"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="backup-empty"]')).not.toBeNull();
  });

  it('backs up on demand and refreshes the list', async () => {
    const { fixture, backup, added } = setup();
    await fixture.whenStable();

    await fixture.componentInstance['backupNow']();

    expect(backup.backupNow).toHaveBeenCalled();
    expect(backup.list).toHaveBeenCalledTimes(2); // ctor + after backup
    expect(added.some((m) => (m as { severity: string }).severity === 'success')).toBe(true);
  });

  it('surfaces the reason when a restore is refused', async () => {
    const { fixture, added } = setup({
      restore: vi.fn(async () => ({
        ok: false,
        reason: 'This backup is from a newer version of Budojo.',
      })),
    });
    await fixture.whenStable();

    await fixture.componentInstance['restore'](archives[0]);

    const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
      detail?: string;
    };
    expect(errorToast?.detail).toContain('newer version');
  });

  it('hides the recovery-keys section when the bridge is absent (web)', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="recovery-keys"]')).toBeNull();
  });

  it('reveals the recovery code on the desktop', async () => {
    const { fixture, keys } = setup({}, { available: true });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="recovery-keys"]')).not.toBeNull();

    await fixture.componentInstance['reveal']();
    fixture.detectChanges();

    expect(keys.reveal).toHaveBeenCalled();
    const code = fixture.nativeElement.querySelector(
      '[data-cy="recovery-code"]',
    ) as HTMLTextAreaElement;
    expect(code?.value).toBe('BUDOJO-RECOVERY-1:abc');
  });

  it('imports a pasted recovery code and surfaces the restart', async () => {
    const { fixture, keys, added } = setup({}, { available: true });
    await fixture.whenStable();

    fixture.componentInstance['setImportValue']('BUDOJO-RECOVERY-1:abc');
    await fixture.componentInstance['importKeys']();

    expect(keys.importCode).toHaveBeenCalledWith('BUDOJO-RECOVERY-1:abc');
    expect(added.some((m) => (m as { severity: string }).severity === 'success')).toBe(true);
  });

  it('surfaces the reason when a recovery code is rejected', async () => {
    const { fixture, added } = setup(
      {},
      {
        available: true,
        importCode: vi.fn(async () => ({
          ok: false,
          reason: 'The recovery code is corrupted or incomplete.',
        })),
      },
    );
    await fixture.whenStable();

    fixture.componentInstance['setImportValue']('nonsense');
    await fixture.componentInstance['importKeys']();

    const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
      detail?: string;
    };
    expect(errorToast?.detail).toContain('corrupted');
  });

  /**
   * Google Drive sync (#1301). The card is desktop-only, and the failure states
   * are what the tests are for: the sync fails silently by design, so the page
   * IS the alarm. A link broken for three weeks must not look healthy.
   */
  describe('drive sync', () => {
    const linked = (over: Record<string, unknown> = {}) => ({
      available: true,
      state: vi.fn(async () => ({
        configured: true,
        linked: true,
        account: 'gym@example.it',
        lastSyncAt: '2026-08-16T12:00:00Z',
        lastError: null,
        ...over,
      })),
    });

    it('hides the card entirely outside the desktop app', async () => {
      const { fixture } = setup();
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="drive-sync"]')).toBeNull();
    });

    // Changed in #1320: it used to say "this build cannot connect to Google
    // Drive". Beside a backup folder that works, an announced feature that
    // apologises for itself is worse than one that is simply absent.
    it('hides the card entirely when the build has no google client', async () => {
      const { fixture } = setup({}, {}, { available: true });
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="drive-sync"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="drive-connect"]')).toBeNull();
    });

    it('offers to connect when configured but not linked', async () => {
      const { fixture } = setup(
        {},
        {},
        { available: true, state: vi.fn(async () => ({ configured: true, linked: false })) },
      );
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="drive-connect"]')).not.toBeNull();
    });

    it('shows the account and the last copy time once linked', async () => {
      const { fixture } = setup({}, {}, linked());
      await settle(fixture);

      const account = fixture.nativeElement.querySelector('[data-cy="drive-account"]');
      expect(account?.textContent).toContain('gym@example.it');
      expect(fixture.nativeElement.querySelector('[data-cy="drive-last-sync"]')).not.toBeNull();
    });

    // The whole point of choosing silent failures: this line is the only thing
    // standing between a broken link and never finding out.
    it('surfaces a sync failure on the page', async () => {
      const { fixture } = setup({}, {}, linked({ lastError: 'storageQuotaExceeded' }));
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="drive-error"]')).not.toBeNull();
    });

    it('still shows the last successful copy time while an error is displayed', async () => {
      // "It is broken" and "the newest copy up there is from Tuesday" are
      // different facts, and the second is the one that matters.
      const { fixture } = setup({}, {}, linked({ lastError: 'network' }));
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="drive-last-sync"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="drive-error"]')).not.toBeNull();
    });

    // The reason the feature exists: a new machine has no local archives, and
    // the ones worth showing are the ones only the account has.
    it('lists an archive that exists only in the account', async () => {
      const { fixture } = setup(
        { list: vi.fn(async () => []) },
        {},
        {
          ...linked(),
          archives: vi.fn(async () => [
            {
              name: 'budojo-backup-20260816-120000.zip',
              sizeBytes: 2_000_000,
              createdAt: null,
              local: false,
              remote: true,
              remoteId: 'id-1',
            },
          ]),
        },
      );
      await settle(fixture);

      expect(fixture.nativeElement.querySelectorAll('[data-cy="backup-list"] li')).toHaveLength(1);
      expect(fixture.nativeElement.querySelector('[data-cy="backup-empty"]')).toBeNull();
    });

    // Restore reads from the local backups directory. Before this was gated the
    // button was rendered for remote-only rows too, and pressing it left the row
    // spinning forever on a file that is not on this disk.
    it('offers no restore for an archive that is only in the account', async () => {
      const { fixture } = setup(
        { list: vi.fn(async () => []) },
        {},
        {
          ...linked(),
          archives: vi.fn(async () => [
            {
              name: 'budojo-backup-20260816-120000.zip',
              sizeBytes: 2_000_000,
              createdAt: null,
              local: false,
              remote: true,
              remoteId: 'id-1',
            },
          ]),
        },
      );
      await settle(fixture);

      expect(
        fixture.nativeElement.querySelector(
          '[data-cy="backup-restore-budojo-backup-20260816-120000.zip"]',
        ),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector(
          '[data-cy="backup-remote-only-budojo-backup-20260816-120000.zip"]',
        ),
      ).not.toBeNull();
    });

    it('keeps restore available for an archive held locally', async () => {
      const { fixture } = setup(
        {},
        {},
        {
          ...linked(),
          archives: vi.fn(async () => [
            {
              name: 'budojo-backup-20260815-090000.zip',
              sizeBytes: 2_500_000,
              createdAt: '2026-08-15T09:00:00Z',
              local: true,
              remote: true,
              remoteId: 'id-1',
            },
          ]),
        },
      );
      await settle(fixture);

      expect(
        fixture.nativeElement.querySelector(
          '[data-cy="backup-restore-budojo-backup-20260815-090000.zip"]',
        ),
      ).not.toBeNull();
    });

    // The page is the only surface for a silently-failing feature, so an
    // untranslated code must never reach it as a raw key.
    it('falls back to a readable message for an error code with no translation', async () => {
      const { fixture } = setup({}, {}, linked({ lastError: 'http_403' }));
      await settle(fixture);

      const text =
        fixture.nativeElement.querySelector('[data-cy="drive-error"]')?.textContent ?? '';
      expect(text).not.toContain('backup.drive.errors');
      expect(text).toContain('http_403');
    });

    it('disconnects through the bridge', async () => {
      const { fixture, drive } = setup({}, {}, linked());
      await settle(fixture);

      await (
        fixture.componentInstance as unknown as { disconnectDrive(): Promise<void> }
      ).disconnectDrive();

      expect(drive.unlink).toHaveBeenCalled();
    });
  });

  /**
   * Backup folder (#1320). The card carries the same weight the Drive one did:
   * copies fail silently by design, so this page is the only alarm there is.
   */
  describe('backup folder', () => {
    const chosen = (over: Record<string, unknown> = {}) => ({
      available: true,
      state: vi.fn(async () => ({
        folder: 'D:/OneDrive/Budojo',
        lastCopyAt: '2026-08-17T09:00:00Z',
        lastError: null,
        lastErrorAt: null,
        ...over,
      })),
    });

    it('hides the card outside the desktop app', async () => {
      const { fixture } = setup();
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="backup-folder"]')).toBeNull();
    });

    it('offers to choose a folder when none is set', async () => {
      const { fixture } = setup({}, {}, {}, { available: true });
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="folder-choose"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="folder-path"]')).toBeNull();
    });

    it('shows the chosen path and the last copy time', async () => {
      const { fixture } = setup({}, {}, {}, chosen());
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="folder-path"]')?.textContent).toContain(
        'D:/OneDrive/Budojo',
      );
      expect(fixture.nativeElement.querySelector('[data-cy="folder-last-copy"]')).not.toBeNull();
    });

    // The reason silent failures are acceptable: this line is the only thing
    // between a folder that has been unplugged for a month and never knowing.
    it('surfaces a copy failure, and keeps the last success beside it', async () => {
      const { fixture } = setup({}, {}, {}, chosen({ lastError: 'ENOENT' }));
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="folder-error"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="folder-last-copy"]')).not.toBeNull();
    });

    it('never renders a raw i18n key for an unrecognised errno', async () => {
      const { fixture } = setup({}, {}, {}, chosen({ lastError: 'EBUSY' }));
      await settle(fixture);

      const text =
        fixture.nativeElement.querySelector('[data-cy="folder-error"]')?.textContent ?? '';
      expect(text).not.toContain('backup.folder.errors');
      expect(text).toContain('EBUSY');
    });

    it('does not toast when the owner cancels the picker', async () => {
      const { fixture, added } = setup(
        {},
        {},
        {},
        { available: true, choose: vi.fn(async () => ({ ok: false })) },
      );
      await settle(fixture);

      await (
        fixture.componentInstance as unknown as { chooseFolder(): Promise<void> }
      ).chooseFolder();

      expect(added).toHaveLength(0);
    });
  });

  /**
   * Loading states (#1322). The page is slow enough on a packaged build to be
   * noticed, and a card with no loading state cannot tell "not known yet" apart
   * from "nothing set" — which is how it ended up rendering a heading with
   * neither a path nor a button.
   */
  describe('loading states', () => {
    // A deferred promise lets the assertions run while the page is still
    // resolving, which is the state being tested.
    function pending<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });

      return { promise, resolve };
    }

    it('shows skeletons, not the word "loading", while the archive list resolves', async () => {
      const gate = pending<BackupArchiveView[]>();
      const { fixture } = setup({ list: vi.fn(() => gate.promise) });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-cy="backup-loading"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="backup-list"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="backup-empty"]')).toBeNull();

      gate.resolve([]);
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('[data-cy="backup-loading"]')).toBeNull();
    });

    // The bug this exists for: neither the path nor the choose button, so the
    // card offered nothing and explained nothing.
    it('never shows the folder card with no path AND no choose button', async () => {
      const gate = pending<{
        folder: string | null;
        lastCopyAt: null;
        lastError: null;
        lastErrorAt: null;
      }>();
      const { fixture } = setup({}, {}, {}, { available: true, state: vi.fn(() => gate.promise) });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement;
      const showsSomething =
        el.querySelector('[data-cy="folder-loading"]') !== null ||
        el.querySelector('[data-cy="folder-path"]') !== null ||
        el.querySelector('[data-cy="folder-choose"]') !== null;

      expect(showsSomething).toBe(true);

      gate.resolve({ folder: null, lastCopyAt: null, lastError: null, lastErrorAt: null });
      await settle(fixture);

      expect(el.querySelector('[data-cy="folder-choose"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="folder-loading"]')).toBeNull();
    });
  });
});
