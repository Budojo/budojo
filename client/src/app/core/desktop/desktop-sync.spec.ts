import { describe, expect, it, vi } from 'vitest';
import { stubBridge } from '../../../test-utils/bridge-test';
import { buffer, fromUtf8, utf8 } from '../sync/bytes';
import { bridgeFetcher, desktopSyncPlatform } from './desktop-sync';

/** The PC's side of the sync (#2032): Drive through the main process, the swap by its restart. */
describe('the PC’s sync platform', () => {
  it('sends Drive calls through the main process, bytes as bytes', async () => {
    const driveFetch = vi.fn(async () => ({
      status: 200,
      headers: {
        date: 'Fri, 02 Oct 2026 21:47:00 GMT',
        'content-type': 'application/octet-stream',
      },
      body: utf8('a version'),
    }));
    const fetcher = bridgeFetcher(stubBridge({ sync: { driveFetch } }).sync);

    const response = await fetcher('https://www.googleapis.com/upload/drive/v3/files?upload_id=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer(utf8('sealed')),
    });

    const [sent] = driveFetch.mock.calls[0] as unknown as [
      { url: string; method: string; headers: Record<string, string>; body: Uint8Array },
    ];
    expect(sent.url).toBe('https://www.googleapis.com/upload/drive/v3/files?upload_id=1');
    expect(sent.method).toBe('PUT');
    expect(sent.headers).toEqual({ 'Content-Type': 'application/octet-stream' });
    expect(fromUtf8(sent.body)).toBe('sealed');
    expect(response.status).toBe(200);
    expect(response.headers.get('date')).toBe('Fri, 02 Oct 2026 21:47:00 GMT');
    expect(fromUtf8(new Uint8Array(await response.arrayBuffer()))).toBe('a version');
  });

  it('answers a 204 with no body, which a Response refuses to carry', async () => {
    const fetcher = bridgeFetcher(
      stubBridge({
        sync: { driveFetch: async () => ({ status: 204, headers: {}, body: new Uint8Array() }) },
      }).sync,
    );

    const response = await fetcher('https://www.googleapis.com/drive/v3/files/x', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
  });

  it('hands over the identity the main process gives, once the PC joined', async () => {
    const identity = { device: 'pc4f2a', folder: 'a'.repeat(32), syncKey: 'k', epoch: 2 };
    const platform = desktopSyncPlatform(
      stubBridge({ sync: { identity: async () => identity } }),
      async () => undefined,
    );

    expect(await platform.identity()).toEqual(identity);
    // The PC made the keys: it publishes its gym into an empty folder.
    expect(platform.publishesFirst).toBe(true);
  });

  it('swaps through the main process, then opens the owner’s session on the database it brought', async () => {
    const steps: string[] = [];
    const swapIn = vi.fn(async () => {
      steps.push('restart');
    });
    const platform = desktopSyncPlatform(stubBridge({ sync: { swapIn } }), async () => {
      steps.push('session');
    });

    await platform.shell.swapIn();

    expect(steps).toEqual(['restart', 'session']);
  });

  it('reconnects Google through the Drive link’s own consent, and says when it did not', async () => {
    const link = vi.fn(async () => ({ ok: false, error: 'access_denied' }));
    const platform = desktopSyncPlatform(stubBridge({ drive: { link } }), async () => undefined);

    await expect(platform.reconnect()).rejects.toThrow('access_denied');
    expect(link).toHaveBeenCalledTimes(1);
  });
});
