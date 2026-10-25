import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { SyncService, SyncState } from '../sync/sync.service';
import {
  LocalNotification,
  LocalNotificationsPlugin,
  NotificationPermission,
  PendingNotification,
  ReminderExtra,
} from './local-notifications';
import { DueReminder, reminderId, ToldLedger } from './phone-reminders';
import { PhoneRemindersService, REMINDER_LEDGER } from './phone-reminders.service';
import { LOCAL_NOTIFICATIONS } from './shell-plugins';
import { SKIP_OFFLINE_REDIRECT } from '../http/skip-offline-redirect';

/**
 * The phone's reminders (#2047): asked of the phone's server at every opening
 * and sync, and handed to Android, which keeps them with the app closed.
 */
describe('the phone reminders (#2047)', () => {
  const URL = '/api/v1/reminders/upcoming';
  const UNPAID: DueReminder = {
    key: 'unpaid:2026-11',
    at: '2026-11-16T09:00:00+01:00',
    title: 'Un atleta non ha ancora pagato la quota di novembre',
    body: 'Marco Bianchi',
    link: '/dashboard/athletes?paid=no',
  };

  let android: {
    permission: NotificationPermission;
    afterAsking: NotificationPermission;
    pending: PendingNotification[];
    channels: unknown[];
    tap: ((action: { notification: { extra?: Partial<ReminderExtra> } }) => void) | null;
  };
  let plugin: LocalNotificationsPlugin & {
    schedule: ReturnType<typeof vi.fn<LocalNotificationsPlugin['schedule']>>;
    cancel: ReturnType<typeof vi.fn<LocalNotificationsPlugin['cancel']>>;
    requestPermissions: ReturnType<typeof vi.fn<LocalNotificationsPlugin['requestPermissions']>>;
  };
  let ledger: ToldLedger;
  let syncState: ReturnType<typeof signal<SyncState>>;

  function remindersWith(shell: LocalNotificationsPlugin | null): {
    reminders: PhoneRemindersService;
    server: HttpTestingController;
  } {
    TestBed.configureTestingModule({
      providers: [
        ...provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCAL_NOTIFICATIONS, useValue: shell },
        { provide: SyncService, useValue: { state: syncState.asReadonly() } },
        {
          provide: REMINDER_LEDGER,
          useValue: { read: () => ledger, write: (told: ToldLedger) => (ledger = told) },
        },
      ],
    });
    return {
      reminders: TestBed.inject(PhoneRemindersService),
      server: TestBed.inject(HttpTestingController),
    };
  }

  /** Answers the phone's server, once the refresh has asked. */
  async function answer(server: HttpTestingController, data: DueReminder[]): Promise<void> {
    await vi.waitFor(() => server.expectOne(URL).flush({ data }));
  }

  beforeEach(() => {
    android = {
      permission: 'granted',
      afterAsking: 'granted',
      pending: [],
      channels: [],
      tap: null,
    };
    ledger = {};
    syncState = signal<SyncState>({ kind: 'off' });
    plugin = {
      checkPermissions: () => Promise.resolve({ display: android.permission }),
      requestPermissions: vi.fn(() => {
        android.permission = android.afterAsking;
        return Promise.resolve({ display: android.permission });
      }),
      createChannel: (channel) => {
        android.channels.push(channel);
        return Promise.resolve();
      },
      schedule: vi.fn(({ notifications }: { notifications: LocalNotification[] }) => {
        android.pending.push(...notifications.map((n) => ({ id: n.id, extra: n.extra })));
        return Promise.resolve({});
      }),
      cancel: vi.fn(({ notifications }: { notifications: { id: number }[] }) => {
        const gone = new Set(notifications.map((n) => n.id));
        android.pending = android.pending.filter((n) => !gone.has(n.id));
        return Promise.resolve();
      }),
      getPending: () => Promise.resolve({ notifications: [...android.pending] }),
      getDeliveredNotifications: () => Promise.resolve({ notifications: [] }),
      addListener: (_event, listener) => {
        android.tap = listener;
        return Promise.resolve({});
      },
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('asks nothing off the phone', async () => {
    const { reminders, server } = remindersWith(null);

    await reminders.start();

    server.expectNone(URL);
    expect(reminders.permission()).toBeNull();
  });

  it('hands the reminders to Android on opening, on a public channel', async () => {
    const { reminders, server } = remindersWith(plugin);

    const started = reminders.start();
    await answer(server, [UNPAID]);
    await started;

    expect(android.channels).toEqual([
      expect.objectContaining({ id: 'reminders', importance: 3, visibility: 1 }),
    ]);
    expect(plugin.schedule).toHaveBeenCalledOnce();
    expect(android.pending.map((n) => n.extra?.key)).toEqual(['unpaid:2026-11']);
    expect(Object.keys(ledger)).toEqual(['unpaid:2026-11']);
  });

  it('cancels a reminder that a sync made untrue: the fee got paid on the PC', async () => {
    const { reminders, server } = remindersWith(plugin);
    const started = reminders.start();
    await answer(server, [UNPAID]);
    await started;

    syncState.set({ kind: 'synced', at: Date.now() });
    TestBed.tick();
    await answer(server, []);

    await vi.waitFor(() =>
      expect(plugin.cancel).toHaveBeenCalledWith({
        notifications: [{ id: reminderId('unpaid:2026-11') }],
      }),
    );
    expect(android.pending).toEqual([]);
  });

  it('asks Android only when the owner says yes on Oggi, then schedules', async () => {
    android.permission = 'prompt';
    const { reminders, server } = remindersWith(plugin);
    await reminders.start();

    server.expectNone(URL);
    expect(reminders.permission()).toBe('prompt');
    expect(plugin.requestPermissions).not.toHaveBeenCalled();

    const asked = reminders.ask();
    await answer(server, [UNPAID]);
    await asked;

    expect(reminders.permission()).toBe('granted');
    expect(android.pending).toHaveLength(1);
  });

  it('schedules nothing once the owner said no', async () => {
    android.permission = 'prompt';
    android.afterAsking = 'denied';
    const { reminders, server } = remindersWith(plugin);
    await reminders.start();

    await reminders.ask();

    server.expectNone(URL);
    expect(reminders.permission()).toBe('denied');
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it('opens the page a reminder is about when it is tapped', async () => {
    const { reminders, server } = remindersWith(plugin);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const started = reminders.start();
    await answer(server, []);
    await started;

    android.tap?.({ notification: { extra: { link: '/dashboard/athletes?paid=no' } } });
    android.tap?.({ notification: { extra: { link: 'https://example.com' } } });

    expect(navigate.mock.calls).toEqual([['/dashboard/athletes?paid=no']]);
  });

  it('keeps what it had when the server does not answer', async () => {
    ledger = { 'unpaid:2026-11': { shown: true, seen: Date.now() } };
    const { reminders, server } = remindersWith(plugin);

    const started = reminders.start();
    await vi.waitFor(() =>
      server.expectOne(URL).flush('starting', { status: 503, statusText: 'Unavailable' }),
    );
    await started;

    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(ledger).toEqual({ 'unpaid:2026-11': { shown: true, seen: expect.any(Number) } });
  });

  it("schedules once the owner turns notifications on in Android's settings and comes back", async () => {
    android.permission = 'denied';
    const { reminders, server } = remindersWith(plugin);
    await reminders.start();
    server.expectNone(URL);

    android.permission = 'granted';
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await answer(server, [UNPAID]);

    await vi.waitFor(() => expect(plugin.schedule).toHaveBeenCalledOnce());
    expect(reminders.permission()).toBe('granted');
  });

  it('never sends the owner to the offline page for a refresh they did not ask for', async () => {
    const { reminders, server } = remindersWith(plugin);

    const started = reminders.start();
    const request = await vi.waitFor(() => server.expectOne(URL));
    expect(request.request.context.get(SKIP_OFFLINE_REDIRECT)).toBe(true);
    request.flush({ data: [] });
    await started;
  });

  it('leaves a reminder untold when Android refuses its replacement, so the next refresh tries again', async () => {
    const { reminders, server } = remindersWith(plugin);
    const started = reminders.start();
    await answer(server, [UNPAID]);
    await started;

    plugin.schedule.mockRejectedValueOnce(new Error('refused'));
    const changed = { ...UNPAID, body: 'Marco Bianchi, Luca Verdi' };
    const again = reminders.refresh();
    await answer(server, [changed]);
    await again;

    expect(android.pending).toEqual([]);
    expect(ledger).toEqual({});
  });
});
