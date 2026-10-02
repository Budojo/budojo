import { describe, expect, it } from 'vitest';
import { forwardedHeaders, isSyncDriveUrl, parseDriveRequest } from './sync-bridge.js';

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
});
