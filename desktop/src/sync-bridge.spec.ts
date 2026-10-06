import { describe, expect, it } from 'vitest';
import {
  checkDelete,
  deletedFileId,
  forwardedHeaders,
  isSyncDriveUrl,
  parseDriveRequest,
  type DriveItem,
} from './sync-bridge.js';

/** Drive for the page's sync engine (#2032): the token goes to Drive's API and nowhere else. */
describe('the sync’s Drive bridge', () => {
  it('lets through Drive’s files API and its uploads', () => {
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files?q=x')).toBe(true);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files/abc?alt=media')).toBe(true);
    expect(
      isSyncDriveUrl('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=1'),
    ).toBe(true);
  });

  it('refuses any other host, scheme, path or a user in the address', () => {
    expect(isSyncDriveUrl('http://www.googleapis.com/drive/v3/files')).toBe(false);
    expect(isSyncDriveUrl('https://evil.example/drive/v3/files')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com.evil.example/drive/v3/files')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/gmail/v1/users/me/messages')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/filesystem')).toBe(false);
    expect(isSyncDriveUrl('https://me@www.googleapis.com/drive/v3/files')).toBe(false);
    expect(isSyncDriveUrl('not a url')).toBe(false);
  });

  it('refuses the hidden application data, where the keys file holds the app keys', () => {
    expect(
      isSyncDriveUrl("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'budojo-keys.json'"),
    ).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files?spaces=drive,appDataFolder')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files?spaces=drive&spaces=appDataFolder')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files?spaces=drive')).toBe(true);
  });

  it('refuses a file’s sub-resources: sharing a file is not the sync’s to do', () => {
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files/abc/permissions')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files/abc/revisions/1')).toBe(false);
    expect(isSyncDriveUrl('https://www.googleapis.com/drive/v3/files/abc')).toBe(true);
    expect(isSyncDriveUrl('https://www.googleapis.com/upload/drive/v3/files/abc?uploadType=resumable')).toBe(true);
  });

  it('drops the page’s own authorization: the main process puts its token on', () => {
    expect(forwardedHeaders({ Authorization: 'Bearer page', 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('takes a well-formed request, and nothing else', () => {
    const bytes = new Uint8Array([1, 2]);
    expect(
      parseDriveRequest({
        url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=1',
        method: 'put',
        headers: { authorization: 'x', 'Content-Type': 'application/octet-stream' },
        body: bytes,
      }),
    ).toEqual({
      url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=1',
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    expect(parseDriveRequest({ url: 'https://evil.example/', method: 'GET', headers: {} })).toBeNull();
    expect(parseDriveRequest({ url: 'https://www.googleapis.com/drive/v3/files', method: 'GET', headers: { a: 1 } })).toBeNull();
    expect(parseDriveRequest(null)).toBeNull();
  });

  it('refuses a PUT anywhere but an upload’s session (#2106)', () => {
    const file = 'https://www.googleapis.com/drive/v3/files/backup123';
    expect(parseDriveRequest({ url: file, method: 'PUT', headers: {} })).toBeNull();
    expect(parseDriveRequest({ url: file, method: 'GET', headers: {} })).not.toBeNull();
  });

  it('takes a delete only of one file by its id, bare: what it deletes is checked after (#2120)', () => {
    const del = (url: string, body?: string) =>
      parseDriveRequest({ url, method: 'delete', headers: {}, ...(body === undefined ? {} : { body }) });
    expect(del('https://www.googleapis.com/drive/v3/files/version123')).toEqual({
      url: 'https://www.googleapis.com/drive/v3/files/version123',
      method: 'DELETE',
      headers: {},
    });
    expect(deletedFileId({ url: 'https://www.googleapis.com/drive/v3/files/version123', method: 'DELETE', headers: {} })).toBe(
      'version123',
    );

    expect(del('https://www.googleapis.com/drive/v3/files')).toBeNull();
    expect(del('https://www.googleapis.com/upload/drive/v3/files/version123')).toBeNull();
    expect(del('https://www.googleapis.com/drive/v3/files/version123?supportsAllDrives=true')).toBeNull();
    expect(del('https://www.googleapis.com/drive/v3/files/version123', '{}')).toBeNull();
    expect(deletedFileId({ url: 'https://www.googleapis.com/drive/v3/files/version123?x=1', method: 'DELETE', headers: {} })).toBeNull();
    expect(deletedFileId({ url: 'https://www.googleapis.com/drive/v3/files/version123', method: 'GET', headers: {} })).toBeNull();
  });

  it('passes only the headers the uploads need: never a method override (#2106)', () => {
    expect(
      forwardedHeaders({
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': '12',
        'X-HTTP-Method-Override': 'DELETE',
        Authorization: 'Bearer page',
      }),
    ).toEqual({
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': '12',
    });
  });

  it('lets a POST only create: to the collection, never to a file by its id (#2106)', () => {
    const post = (url: string) => parseDriveRequest({ url, method: 'POST', headers: {}, body: '{}' });
    expect(post('https://www.googleapis.com/drive/v3/files')).not.toBeNull();
    expect(post('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id')).not.toBeNull();
    expect(post('https://www.googleapis.com/drive/v3/files/backup123')).toBeNull();
    expect(post('https://www.googleapis.com/upload/drive/v3/files/backup123?uploadType=resumable')).toBeNull();
  });

  it('lets a PATCH only open an upload of new content: never trash, rename or move a file (#2106)', () => {
    const upload = 'https://www.googleapis.com/upload/drive/v3/files/backup123?uploadType=resumable&fields=id';
    expect(parseDriveRequest({ url: upload, method: 'PATCH', headers: {}, body: '{}' })).not.toBeNull();

    const file = 'https://www.googleapis.com/drive/v3/files/backup123';
    expect(parseDriveRequest({ url: file, method: 'PATCH', headers: {}, body: '{"trashed":true}' })).toBeNull();
    expect(parseDriveRequest({ url: file, method: 'PATCH', headers: {}, body: '{}' })).toBeNull();
    expect(parseDriveRequest({ url: upload, method: 'PATCH', headers: {}, body: '{"trashed":true}' })).toBeNull();
    expect(
      parseDriveRequest({ url: `${upload}&addParents=elsewhere&removeParents=backups`, method: 'PATCH', headers: {}, body: '{}' }),
    ).toBeNull();
  });
});

/**
 * The sync's deletes (#2120): the device that pushes prunes the folder's
 * versions, and the PC's main process forwards a delete only for a version in
 * this PC's sync folder. Read from the file up, each link by name.
 */
describe('the sync’s deletes', () => {
  const FOLDER = 'application/vnd.google-apps.folder';
  const item = (id: string, name: string, parents: string[], mimeType = 'application/octet-stream'): DriveItem => ({
    id,
    name,
    mimeType,
    parents,
  });
  const budojo = 'budojo-1';
  const sync = item('sync-1', 'sync', [budojo], FOLDER);
  const versions = item('versions-1', 'versions', ['sync-1'], FOLDER);
  const version = item('v-45', '000045-phone9c1e.000044-pc4f2a.bjs', ['versions-1']);

  it('reads from the file up, and forwards a version in this PC’s sync folder', () => {
    expect(checkDelete([version], budojo)).toEqual({ read: 'versions-1' });
    expect(checkDelete([version, versions], budojo)).toEqual({ read: 'sync-1' });
    expect(checkDelete([version, versions, sync], budojo)).toBe(true);
    expect(checkDelete([item('v-1', '000001-pc4f2a.root.bjs', ['versions-1']), versions, sync], budojo)).toBe(true);
  });

  it('refuses any other name at the first read: a backup, the keys, a report, a document', () => {
    for (const name of [
      'budojo-backup-20261006-120000.zip',
      'budojo-keys.json',
      'folder.bjs',
      'pc4f2a.bjs',
      '000045-phone9c1e.bjs',
      '000045-PHONE.000044-pc4f2a.bjs',
      '45-phone9c1e.44-pc4f2a.bjs',
      '000045-phone9c1e.000044-pc4f2a.bjs.zip',
      `${'a'.repeat(64)}.bjs`,
    ]) {
      expect(checkDelete([item('x', name, ['versions-1'])], budojo)).toBe(false);
    }
  });

  it('refuses a version’s name anywhere but in `versions/` inside this PC’s sync folder', () => {
    // In the `Budojo` folder, beside the backups.
    expect(checkDelete([item('v', version.name, [budojo]), item(budojo, 'Budojo', ['root'], FOLDER)], budojo)).toBe(false);
    // In `devices/` or `files/`.
    const devices = item('devices-1', 'devices', ['sync-1'], FOLDER);
    expect(checkDelete([item('v', version.name, ['devices-1']), devices], budojo)).toBe(false);
    const files = item('files-1', 'files', ['sync-1'], FOLDER);
    expect(checkDelete([item('v', version.name, ['files-1']), files], budojo)).toBe(false);
    // In a `versions` folder of a `sync` folder elsewhere: another `Budojo` folder, or none.
    expect(checkDelete([version, versions, item('sync-1', 'sync', ['budojo-2'], FOLDER)], budojo)).toBe(false);
    expect(checkDelete([version, versions, item('sync-1', 'sync', [], FOLDER)], budojo)).toBe(false);
    // In a `versions` folder right inside the `Budojo` folder, or inside another folder there.
    expect(checkDelete([version, versions, item('sync-1', 'Budojo', [budojo], FOLDER)], budojo)).toBe(false);
    expect(checkDelete([version, versions, item('sync-1', 'backups', [budojo], FOLDER)], budojo)).toBe(false);
  });

  it('refuses a chain that does not hold together: a folder, two parents, a file posing as a folder', () => {
    expect(checkDelete([item('v', version.name, ['versions-1'], FOLDER)], budojo)).toBe(false);
    expect(checkDelete([item('v', version.name, ['versions-1', 'elsewhere'])], budojo)).toBe(false);
    expect(checkDelete([item('v', version.name, [])], budojo)).toBe(false);
    expect(checkDelete([version, item('versions-1', 'versions', ['sync-1'])], budojo)).toBe(false);
    expect(checkDelete([version, item('versions-1', 'versions', ['sync-1', 'sync-2'], FOLDER)], budojo)).toBe(false);
    expect(checkDelete([version, versions, item('sync-1', 'sync', [budojo])], budojo)).toBe(false);
    expect(checkDelete([version, versions, item('sync-1', 'sync', [budojo, 'elsewhere'], FOLDER)], budojo)).toBe(false);
  });

  it('refuses a folder that is not the parent the file names', () => {
    expect(checkDelete([version, item('versions-2', 'versions', ['sync-1'], FOLDER)], budojo)).toBe(false);
    expect(checkDelete([version, versions, item('sync-2', 'sync', [budojo], FOLDER)], budojo)).toBe(false);
  });

  it('never takes a folder’s name for a property of its own', () => {
    expect(checkDelete([version, item('versions-1', 'constructor', ['sync-1'], FOLDER)], budojo)).toBe(false);
    expect(checkDelete([version, item('versions-1', '__proto__', ['sync-1'], FOLDER)], budojo)).toBe(false);
  });

  it('refuses an empty chain, and reads nothing past three', () => {
    expect(checkDelete([], budojo)).toBe(false);
    expect(checkDelete([version, versions, sync, item(budojo, 'Budojo', ['root'], FOLDER)], budojo)).toBe(false);
  });
});
