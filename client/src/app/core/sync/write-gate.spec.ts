import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { WriteGate, writeGateInterceptor } from './write-gate';

/** The page's writes, held while the sync swaps the database, and told to it when they land (#2046). */
describe('WriteGate', () => {
  let gate: WriteGate;
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([writeGateInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    gate = TestBed.inject(WriteGate);
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Lets queued promise callbacks run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('holds a write sent while the sync works, and sends it after', async () => {
    let release = (): void => undefined;
    const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    const write = firstValueFrom(client.post('/api/v1/attendance', { athlete_id: 1 }));
    await settle();
    http.expectNone('/api/v1/attendance');

    release();
    await held;
    await settle();
    http.expectOne('/api/v1/attendance').flush({ data: {} });
    await write;
  });

  it('fails the writes it held once the database was replaced, and every write after, while reads go on', async () => {
    let release = (): void => undefined;
    let swapped = false;
    const held = gate.hold(
      () => new Promise<void>((resolve) => (release = resolve)),
      () => swapped,
    );
    await settle();

    const queued = firstValueFrom(
      client.post('/api/v1/athletes/4/payments', { year: 2026, month: 10 }),
    );
    await settle();
    swapped = true;
    release();
    await held;

    await expect(queued).rejects.toMatchObject({ status: 409 });
    await expect(firstValueFrom(client.delete('/api/v1/attendance/7'))).rejects.toMatchObject({
      status: 409,
    });
    http.expectNone('/api/v1/athletes/4/payments');
    http.expectNone('/api/v1/attendance/7');
    const read = firstValueFrom(client.get('/api/v1/athletes'));
    http.expectOne('/api/v1/athletes').flush({ data: [] });
    await read;
  });

  it('holds the owner’s answers to a conflict like any write: a swap must never miss one (#2038)', async () => {
    let release = (): void => undefined;
    const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    const answer = firstValueFrom(
      client.post('/api/v1/sync/conflicts/01K6F3Q8Z4M7X2N5P9R1T3V6W8/decision', {
        decision: 'theirs',
      }),
    );
    await settle();
    http.expectNone('/api/v1/sync/conflicts/01K6F3Q8Z4M7X2N5P9R1T3V6W8/decision');

    release();
    await held;
    await settle();
    http.expectOne('/api/v1/sync/conflicts/01K6F3Q8Z4M7X2N5P9R1T3V6W8/decision').flush(null);
    await answer;
  });

  it('holds a restore the door starts while a round finishes: only the session passes', async () => {
    let release = (): void => undefined;
    const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    const restore = firstValueFrom(client.post('/api/v1/device/backup/restore', {}));
    await settle();
    http.expectNone('/api/v1/device/backup/restore');

    release();
    await held;
    await settle();
    http.expectOne('/api/v1/device/backup/restore').flush({});
    await restore;
  });

  it('waits for a write already sent before the sync works', async () => {
    const write = firstValueFrom(client.post('/api/v1/attendance', { athlete_id: 1 }));
    const pending = http.expectOne('/api/v1/attendance');

    const steps: string[] = [];
    const held = gate.hold(async () => {
      steps.push('work');
    });
    await settle();
    expect(steps).toEqual([]);

    pending.flush({ data: {} });
    await write;
    await held;
    expect(steps).toEqual(['work']);
  });

  it('lets the sync’s own requests through while it holds, and holds the page’s reads too (#2032)', async () => {
    let release = (): void => undefined;
    const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    const read = firstValueFrom(client.get('/api/v1/athletes'));
    const stage = firstValueFrom(client.put('/api/v1/sync/stage', null));
    const session = firstValueFrom(client.post('/api/v1/device/session', {}));
    await settle();
    http.expectOne('/api/v1/sync/stage').flush(null);
    http.expectOne('/api/v1/device/session').flush({ token: 't' });
    http.expectNone('/api/v1/athletes');
    await stage;
    await session;

    release();
    await held;
    await settle();
    http.expectOne('/api/v1/athletes').flush({ data: [] });
    await read;
  });

  it('waits for a read already sent before it holds, and a read never tells the sync to push', async () => {
    let landed = 0;
    gate.written$.subscribe(() => landed++);
    const read = firstValueFrom(client.get('/api/v1/athletes'));
    const pending = http.expectOne('/api/v1/athletes');

    const steps: string[] = [];
    const held = gate.hold(async () => {
      steps.push('swap');
    });
    await settle();
    // The server is not stopped under a read still on its way.
    expect(steps).toEqual([]);

    pending.flush({ data: [] });
    await read;
    await held;
    expect(steps).toEqual(['swap']);
    expect(landed).toBe(0);
  });

  it('lets the session through while it holds: the swap opens it again inside the hold (#2046)', async () => {
    let release = (): void => undefined;
    const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    const session = firstValueFrom(client.post('/api/v1/device/session', {}));
    http.expectOne('/api/v1/device/session').flush({ token: 't' });
    await session;

    release();
    await held;
  });

  it('tells the sync about a write the server took, and not about one it refused', async () => {
    let landed = 0;
    gate.written$.subscribe(() => landed++);

    const ok = firstValueFrom(client.post('/api/v1/attendance', {}));
    http.expectOne('/api/v1/attendance').flush({ data: {} });
    await ok;
    expect(landed).toBe(1);

    const refused = firstValueFrom(client.post('/api/v1/attendance', {}));
    http
      .expectOne('/api/v1/attendance')
      .flush({ message: 'no' }, { status: 422, statusText: 'Unprocessable' });
    await expect(refused).rejects.toBeTruthy();
    expect(landed).toBe(1);
  });

  it('does not wait for a write given up before it was sent', async () => {
    let release = (): void => undefined;
    const first = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();
    const abandoned = client.post('/api/v1/attendance', {}).subscribe();
    abandoned.unsubscribe();
    release();
    await first;

    // A second hold finds nothing in flight.
    await gate.hold(async () => undefined);
    http.expectNone('/api/v1/attendance');
  });

  it('refuses a second hold while one runs: sync rounds never overlap', async () => {
    let release = (): void => undefined;
    const first = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await expect(gate.hold(async () => undefined)).rejects.toThrow('never overlap');
    release();
    await first;
  });
});
