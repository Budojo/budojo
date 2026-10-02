import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DeviceService } from './device.service';

/**
 * What only this app's page may ask of its own server (#2079): every call
 * carries the secret the shell made at launch.
 */
describe('DeviceService (#2079)', () => {
  function setup() {
    window.__BUDOJO_MOBILE__ = { apiBase: 'http://127.0.0.1:41234', shellSecret: 'from-the-shell' };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return { service: TestBed.inject(DeviceService), http: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => {
    delete (window as { __BUDOJO_MOBILE__?: unknown }).__BUDOJO_MOBILE__;
  });

  it("asks for the owner's session with the shell's secret", async () => {
    const { service, http } = setup();

    const answer = firstValueFrom(service.session());
    const request = http.expectOne((req) => req.url.endsWith('/api/v1/device/session'));
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Budojo-Shell')).toBe('from-the-shell');
    request.flush({ token: 't', data: {} });

    await expect(answer).resolves.toEqual({ token: 't', data: {} });
  });

  it("sends a backup as the file itself, which the phone's native HTTP sends as bytes", async () => {
    const { service, http } = setup();
    const archive = new File([new Uint8Array([80, 75, 3, 4])], 'b.zip', {
      type: 'application/zip',
    });

    const answer = firstValueFrom(service.restore(archive));
    const request = http.expectOne((req) => req.url.endsWith('/api/v1/device/backup/restore'));
    expect(request.request.body).toBe(archive);
    expect(request.request.headers.get('X-Budojo-Shell')).toBe('from-the-shell');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await answer;
  });

  it('inspects a backup the same way', () => {
    const { service, http } = setup();
    const archive = new File(['x'], 'b.zip', { type: 'application/zip' });

    service.inspect(archive).subscribe();
    const request = http.expectOne((req) => req.url.endsWith('/api/v1/device/backup/inspect'));
    expect(request.request.body).toBe(archive);
    expect(request.request.headers.get('X-Budojo-Shell')).toBe('from-the-shell');
  });
});
