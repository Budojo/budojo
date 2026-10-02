import { describe, expect, it, vi } from 'vitest';
import { RemoteError } from '../sync/remote';
import { Fetcher, PcBackups } from './pc-backups';

/**
 * The PC's backups on Google Drive, as the phone's door finds them (#2079).
 * Drive is answered by a fake that reads the query it was asked.
 */

function drive(
  answers: {
    folders?: { id: string }[];
    files?: { id: string; name: string }[];
    email?: string;
    keys?: unknown;
    keyFiles?: number;
    /** The key files one per page, each page but the last with a token to the next. */
    keyPages?: boolean;
  } = {},
): { fetcher: Fetcher; urls: string[] } {
  const urls: string[] = [];
  const fetcher: Fetcher = vi.fn(async (url: string) => {
    urls.push(url);
    if (url.includes('/about')) {
      return Response.json({ user: { emailAddress: answers.email ?? 'mario@gmail.com' } });
    }
    if (url.includes('spaces=appDataFolder')) {
      const count = answers.keyFiles ?? (answers.keys === undefined ? 0 : 1);
      const ids = Array.from({ length: count }, (_, i) => ({ id: `keys-${i + 1}` }));
      if (answers.keyPages) {
        const page = Number(new URL(url).searchParams.get('pageToken') ?? 0);
        return Response.json({
          files: [ids[page]],
          ...(page + 1 < ids.length ? { nextPageToken: String(page + 1) } : {}),
        });
      }
      return Response.json({ files: ids });
    }
    if (url.includes('/files/keys-1?alt=media')) {
      return Response.json(answers.keys);
    }
    if (url.includes('alt=media')) {
      return new Response(new Uint8Array([80, 75, 3, 4]));
    }
    const query = new URL(url).searchParams.get('q') ?? '';
    if (query.includes("mimeType='application/vnd.google-apps.folder'")) {
      return Response.json({ files: answers.folders ?? [{ id: 'budojo-folder' }] });
    }
    return Response.json({ files: answers.files ?? [] });
  });
  return { fetcher, urls };
}

const token = async () => 'google-token';

describe("the PC's backups on Drive (#2079)", () => {
  it("lists the backups in the PC's folder, newest first", async () => {
    const { fetcher, urls } = drive({
      files: [
        { id: 'a', name: 'budojo-backup-20260930-100000.zip' },
        { id: 'c', name: 'budojo-backup-20261001-165132.zip' },
        { id: 'b', name: 'budojo-backup-20261001-103000.zip' },
      ],
    });

    const found = await new PcBackups(token, fetcher).newestFirst();

    expect(found.map((b) => b.id)).toEqual(['c', 'b', 'a']);
    expect(new URL(urls[1]).searchParams.get('q')).toContain("'budojo-folder' in parents");
  });

  it("leaves out anything that is not one of the PC's archives", async () => {
    const { fetcher } = drive({
      files: [
        { id: 'real', name: 'budojo-backup-20261001-165132.zip' },
        { id: 'copy', name: 'budojo-backup-20261001-165132 (1).zip' },
        { id: 'probe', name: 'budojo-backup-keep.zip' },
      ],
    });

    expect((await new PcBackups(token, fetcher).newestFirst()).map((b) => b.id)).toEqual(['real']);
  });

  it('finds none when the PC has not connected Drive yet: there is no folder', async () => {
    const { fetcher, urls } = drive({ folders: [] });

    expect(await new PcBackups(token, fetcher).newestFirst()).toEqual([]);
    expect(urls).toHaveLength(1);
  });

  it('settles on the oldest Budojo folder, as the sync does', async () => {
    const { fetcher, urls } = drive();

    await new PcBackups(token, fetcher).newestFirst();

    expect(new URL(urls[0]).searchParams.get('orderBy')).toBe('createdTime');
  });

  it('names the account it looked in', async () => {
    const { fetcher } = drive({ email: 'kaizen@gmail.com' });

    expect(await new PcBackups(token, fetcher).account()).toBe('kaizen@gmail.com');
  });

  it("downloads a backup's bytes as they are, with the token", async () => {
    const { fetcher } = drive();

    const bytes = await new PcBackups(token, fetcher).download({ id: 'c', name: 'x.zip' });

    expect([...bytes]).toEqual([80, 75, 3, 4]);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/files/c?alt=media'), {
      headers: { Authorization: 'Bearer google-token' },
    });
  });

  it('tells a refused token from no network', async () => {
    const refused: Fetcher = async () => new Response('', { status: 401 });
    const offline: Fetcher = async () => Promise.reject(new TypeError('Failed to fetch'));

    await expect(new PcBackups(token, refused).account()).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    await expect(new PcBackups(token, offline).account()).rejects.toBeInstanceOf(RemoteError);
    await expect(new PcBackups(token, offline).account()).rejects.toMatchObject({
      reason: 'offline',
    });
  });

  describe("the academy's keys (#2033)", () => {
    const keys = {
      v: 1,
      folder: '0123456789abcdef0123456789abcdef',
      syncKey: btoa('k'.repeat(32)),
      APP_KEY: `base64:${btoa('a'.repeat(32))}`,
      DOCUMENT_ENCRYPTION_KEY: btoa('d'.repeat(32)),
      createdAt: '2026-10-02T18:00:00.000Z',
    };

    it("reads them from the account's hidden application data", async () => {
      const { fetcher, urls } = drive({ keys });

      const found = await new PcBackups(token, fetcher).academyKeys();

      expect(found?.APP_KEY).toBe(keys.APP_KEY);
      expect(new URL(urls[0]).searchParams.get('spaces')).toBe('appDataFolder');
    });

    it('finds none while the PC has not connected the phone', async () => {
      const { fetcher } = drive();

      expect(await new PcBackups(token, fetcher).academyKeys()).toBeNull();
    });

    it('takes neither when the account holds the keys twice, as the PC refuses to', async () => {
      const { fetcher, urls } = drive({ keys, keyFiles: 2 });

      await expect(new PcBackups(token, fetcher).academyKeys()).rejects.toThrow('twice');
      expect(urls.some((url) => url.includes('alt=media'))).toBe(false);
    });

    it('follows the pages: a second key file on the next page is still refused', async () => {
      const { fetcher, urls } = drive({ keys, keyFiles: 2, keyPages: true });

      await expect(new PcBackups(token, fetcher).academyKeys()).rejects.toThrow('twice');
      expect(urls.filter((url) => url.includes('spaces=appDataFolder'))).toHaveLength(2);
      expect(urls.some((url) => url.includes('alt=media'))).toBe(false);
    });

    it('refuses keys that do not read, rather than adopt half of them', async () => {
      const { fetcher } = drive({ keys: { ...keys, syncKey: 'short' } });

      await expect(new PcBackups(token, fetcher).academyKeys()).rejects.toBeInstanceOf(RemoteError);
    });
  });
});
