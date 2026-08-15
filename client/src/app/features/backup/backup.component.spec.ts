import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { BackupComponent } from './backup.component';
import {
  DesktopBackupService,
  type BackupArchiveView,
} from '../../core/services/desktop-backup.service';
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

  function setup(overrides: Partial<DesktopBackupService> = {}) {
    const added: unknown[] = [];
    const backup: Partial<DesktopBackupService> = {
      list: vi.fn(async () => archives),
      backupNow: vi.fn(async () => true),
      restore: vi.fn(async () => ({ ok: true })),
      ...overrides,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideI18nTesting(),
        MessageService, // real one: p-toast subscribes to its stream
        ConfirmationService, // confirm-destructive-button needs it
        { provide: DesktopBackupService, useValue: backup },
      ],
    });
    // Spy on add() so the assertions read the toasts without stubbing the
    // service p-toast needs.
    vi.spyOn(TestBed.inject(MessageService), 'add').mockImplementation((m) => added.push(m));
    const fixture = TestBed.createComponent(BackupComponent);
    fixture.detectChanges();
    return { fixture, backup, added };
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
});
