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

  it('lets reads and the sync’s own requests through while the writes are held', async () => {
    let release = (): void => undefined;
    const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
    await settle();

    const read = firstValueFrom(client.get('/api/v1/athletes'));
    const stage = firstValueFrom(client.put('/api/v1/sync/stage', null));
    http.expectOne('/api/v1/athletes').flush({ data: [] });
    http.expectOne('/api/v1/sync/stage').flush(null);
    await read;
    await stage;

    release();
    await held;
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
