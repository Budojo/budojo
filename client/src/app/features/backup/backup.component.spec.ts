import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { BackupComponent } from './backup.component';
import {
  DesktopBackupService,
  type BackupArchiveView,
} from '../../core/services/desktop-backup.service';
import { DesktopKeysService } from '../../core/services/desktop-keys.service';
import { DriveSyncService } from '../../core/services/drive-sync.service';
import { BackupFolderService } from '../../core/services/backup-folder.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { LanguageService } from '../../core/services/language.service';

/**
 * Data & backup page (#1228): shows the last backup, backs up, restores with a
 * refusal surfaced.
 *
 * **ConfirmationService is deliberately NOT provided here.** It used to be, and
 * that is precisely how #1324 hid: the component itself never provided it, so
 * every confirm button threw NG0201 in the real app while every test passed
 * against a TestBed that supplied it. A spec that hands the component a
 * dependency production does not have proves the spec works, not the component.
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
      restoreFromFile: vi.fn(async () => ({ ok: true })),
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

  it('dates the archives in the active language, without seconds (#1624)', async () => {
    // Four timestamps on this page read "Aug 15, 2026, 9:00:00 AM" under an
    // Italian UI: `| date` formats against LOCALE_ID, which nothing sets.
    const { fixture } = setup();
    TestBed.inject(LanguageService).setLanguage('it');
    await fixture.whenStable();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.backup-page__row-date')?.textContent ?? '';
    expect(row).toContain('15 ago 2026');
    expect(row).not.toMatch(/\d{2}:\d{2}:\d{2}/);
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

  it('says why a restore is refused, in the page language', async () => {
    const { fixture, added } = setup({
      restore: vi.fn(async () => ({
        ok: false,
        code: 'newer' as const,
        reason: 'This backup is from a newer version of Budojo.',
      })),
    });
    await fixture.whenStable();

    await fixture.componentInstance['restore'](archives[0]);

    const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
      detail?: string;
    };
    expect(errorToast?.detail).toBe(
      'This backup comes from a newer version of Budojo. Update Budojo, then restore it.',
    );
  });

  it('falls back to the reason for a refusal it has no words for', async () => {
    const { fixture, added } = setup({
      restore: vi.fn(async () => ({ ok: false, reason: 'Budojo is not ready to restore yet.' })),
    });
    await fixture.whenStable();

    await fixture.componentInstance['restore'](archives[0]);

    const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
      detail?: string;
    };
    expect(errorToast?.detail).toBe('Budojo is not ready to restore yet.');
  });

  describe('restoring from a file (#1909)', () => {
    it('offers it beside the list, even when the list is empty', async () => {
      // A new computer: nothing in the list, and this is the way back.
      const { fixture } = setup({ list: vi.fn(async () => []) });
      await fixture.whenStable();
      fixture.detectChanges();

      // Since #1910 it is the new-computer block that offers it on an empty list.
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-cy="backup-new-computer-restore"]',
      );
      expect(button?.textContent).toContain('Restore from a file');
    });

    it('says nothing when the owner closes the file dialog', async () => {
      const { fixture, added } = setup({
        restoreFromFile: vi.fn(async () => ({ ok: false, canceled: true })),
      });
      await fixture.whenStable();

      await fixture.componentInstance['restoreFromFile']();

      expect(added).toHaveLength(0);
    });

    it('says the file is not a Budojo backup', async () => {
      const { fixture, added } = setup({
        restoreFromFile: vi.fn(async () => ({
          ok: false,
          code: 'unreadable' as const,
          reason: 'Not a zip archive',
        })),
      });
      await fixture.whenStable();

      await fixture.componentInstance['restoreFromFile']();

      const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
        detail?: string;
      };
      expect(errorToast?.detail).toBe('This file is not a Budojo backup.');
    });

    it('says Budojo is busy when a backup or restore is already running', async () => {
      const { fixture, added } = setup({
        restoreFromFile: vi.fn(async () => ({
          ok: false,
          code: 'busy' as const,
          reason: 'A backup or restore is already running.',
        })),
      });
      await fixture.whenStable();

      await fixture.componentInstance['restoreFromFile']();

      const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
        detail?: string;
      };
      expect(errorToast?.detail).toBe(
        'Budojo is already backing up or restoring: try again in a moment.',
      );
    });

    it('does not call a broken swap "not a backup"', async () => {
      // The archive passed every check; what broke was writing it in.
      const { fixture, added } = setup({
        restoreFromFile: vi.fn(async () => ({
          ok: false,
          code: 'failed' as const,
          reason: 'ENOSPC: no space left on device',
        })),
      });
      await fixture.whenStable();

      await fixture.componentInstance['restoreFromFile']();

      const errorToast = added.find((m) => (m as { severity: string }).severity === 'error') as {
        detail?: string;
      };
      expect(errorToast?.detail).toBe("The restore did not finish. The reason is in Budojo's log.");
    });

    it('stops spinning when the desktop does not answer', async () => {
      const { fixture } = setup({
        restoreFromFile: vi.fn(async () => {
          throw new Error('ipc gone');
        }),
      });
      await fixture.whenStable();

      await expect(fixture.componentInstance['restoreFromFile']()).rejects.toThrow('ipc gone');
      expect(fixture.componentInstance['restoringFromFile']()).toBe(false);
    });

    it('confirms a restored file like any other restore', async () => {
      const { fixture, added } = setup();
      await fixture.whenStable();

      await fixture.componentInstance['restoreFromFile']();

      expect(added.some((m) => (m as { severity: string }).severity === 'success')).toBe(true);
    });
  });

  // The confirm button asks ConfirmationService for a popup; only a
  // `<p-confirmpopup>` in this template can show it. Without one the click
  // did nothing — and every other test here bypasses it by calling
  // `restore()` directly, which is how the desktop audit (#1614) found
  // Restore inert on the shipped page (#1615). This one presses the button.
  it('opens a confirm popup when restore is pressed, instead of doing nothing', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-cy="backup-restore-budojo-backup-20260815-090000.zip"] button',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Not just any popup: this one's message, so the wiring of the confirm
    // text is covered too.
    expect(document.body.querySelector('.p-confirmpopup')?.textContent).toContain(
      'Restore this backup?',
    );
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

  // #1910 — the page says how to come back, and restoring stops being loud.
  describe('the way back (#1910)', () => {
    const el = (fixture: { nativeElement: HTMLElement }, cy: string): HTMLElement | null =>
      fixture.nativeElement.querySelector(`[data-cy="${cy}"]`);

    async function settled(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('leads with the way back on a computer with no backups', async () => {
      const { fixture } = setup({ list: vi.fn(async () => []) }, { available: true });
      await settled(fixture);

      expect(el(fixture, 'backup-new-computer')?.textContent).toContain(
        'Coming from another computer?',
      );
      expect(el(fixture, 'backup-new-computer-restore')).not.toBeNull();
      expect(el(fixture, 'backup-new-computer-keys')).not.toBeNull();
      // Once, not twice: the list's own button steps back while the block leads.
      expect(el(fixture, 'backup-restore-from-file')).toBeNull();
    });

    it('does not offer the recovery code on a build without the keys bridge', async () => {
      const { fixture } = setup({ list: vi.fn(async () => []) });
      await settled(fixture);

      expect(el(fixture, 'backup-new-computer')?.textContent).not.toContain('recovery code');
      expect(el(fixture, 'backup-new-computer-keys')).toBeNull();
    });

    it('takes the owner to the recovery code field, cursor in it', async () => {
      const { fixture } = setup({ list: vi.fn(async () => []) }, { available: true });
      await settled(fixture);

      el(fixture, 'backup-new-computer-keys')?.querySelector('button')?.click();

      expect(document.activeElement).toBe(el(fixture, 'recovery-import-input'));
    });

    it('stays out of the way once there are backups', async () => {
      const { fixture } = setup();
      await settled(fixture);

      expect(el(fixture, 'backup-new-computer')).toBeNull();
      expect(el(fixture, 'backup-restore-from-file')).not.toBeNull();
    });

    it('marks the latest backup, and only that one', async () => {
      const { fixture } = setup();
      await settled(fixture);

      const tags = fixture.nativeElement.querySelectorAll('[data-cy="backup-latest"]');
      expect(tags).toHaveLength(1);
      expect(fixture.nativeElement.querySelector('.backup-page__row')?.textContent).toContain(
        'Latest',
      );
    });

    it('shows the newest five, and all of them on request', async () => {
      const many: BackupArchiveView[] = Array.from({ length: 7 }, (_, i) => ({
        name: `budojo-backup-2026081${9 - i}-090000.zip`,
        createdAt: `2026-08-1${9 - i}T09:00:00Z`,
        sizeBytes: 2_000_000,
      }));
      const { fixture } = setup({ list: vi.fn(async () => many) });
      await settled(fixture);

      expect(fixture.nativeElement.querySelectorAll('.backup-page__row')).toHaveLength(5);
      const toggle = (): HTMLButtonElement | null | undefined =>
        el(fixture, 'backup-show-all')?.querySelector('button');
      expect(toggle()?.textContent).toContain('Show all (7)');

      const pressed = toggle();
      pressed?.focus();
      pressed?.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.backup-page__row')).toHaveLength(7);
      // The same control, still there, still holding focus: a button that
      // removed itself would drop a keyboard user onto the page.
      expect(toggle()?.textContent).toContain('Show fewer');
      expect(document.activeElement).toBe(pressed);

      toggle()?.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.backup-page__row')).toHaveLength(5);
    });

    it('still leads with the way back when only Drive has backups', async () => {
      // None of those can be restored here yet, so they are not a way back.
      const { fixture } = setup(
        { list: vi.fn(async () => []) },
        { available: true },
        {
          available: true,
          state: vi.fn(async () => ({ configured: true, linked: true, account: 'gym@example.it' })),
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
      await settled(fixture);
      await settled(fixture);

      expect(el(fixture, 'backup-new-computer')).not.toBeNull();
    });

    it('asks for the recovery code before the restore', async () => {
      // A restore reloads the window and fills the list, so this block is gone
      // by the time a second step would be read.
      const { fixture } = setup({ list: vi.fn(async () => []) }, { available: true });
      await settled(fixture);

      const steps = fixture.nativeElement.querySelectorAll('.backup-page__arrival-step');
      expect(steps).toHaveLength(2);
      expect(steps[0].querySelector('[data-cy="backup-new-computer-keys"]')).not.toBeNull();
      expect(steps[1].querySelector('[data-cy="backup-new-computer-restore"]')).not.toBeNull();
    });

    it('does not paint restore red on every row', async () => {
      const { fixture } = setup();
      await settled(fixture);

      const restore = el(fixture, `backup-restore-${archives[0].name}`)?.querySelector('button');
      expect(restore?.className).toContain('p-button-secondary');
      expect(restore?.className).not.toContain('p-button-danger');
    });

    it('says in the folder section that those copies are the way back', async () => {
      const { fixture } = setup(
        {},
        {},
        {},
        {
          available: true,
          state: vi.fn(async () => ({
            folder: 'D:\\OneDrive\\Budojo',
            lastCopyAt: '2026-08-15T09:00:00Z',
            lastError: null,
            lastErrorAt: null,
          })),
        },
      );
      await settled(fixture);
      await settled(fixture);

      expect(el(fixture, 'folder-why-restore')?.textContent).toContain('If you change computers');
    });
  });
});
