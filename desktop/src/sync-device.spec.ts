import { describe, expect, it } from 'vitest';
import { newPcDeviceId, parseDeviceFile, serializeDeviceFile } from './sync-device.js';

/** This PC's id in the sync folder (#2032). */
describe('the PC’s device id', () => {
  it('is pc and four characters the folder’s layout takes', () => {
    for (let i = 0; i < 200; i++) {
      expect(newPcDeviceId()).toMatch(/^pc[0-9a-z]{4}$/);
    }
  });

  it('draws again past the last whole multiple of the alphabet, so no character is likelier', () => {
    const bytes = [255, 252, 0, 35, 36, 1];
    const id = newPcDeviceId((n) => Buffer.from(Array.from({ length: n }, (_, i) => bytes[i] ?? 0)));
    // 255 and 252 are past 252 (= 7 × 36) and skipped.
    expect(id).toBe('pc0z01');
  });

  it('reads back what it wrote', () => {
    expect(parseDeviceFile(serializeDeviceFile({ device: 'pc4f2a', epoch: 3 }))).toEqual({
      device: 'pc4f2a',
      epoch: 3,
    });
  });

  it('starts the epoch at 0 when the file has none that reads', () => {
    expect(parseDeviceFile('{"device":"pc4f2a"}')).toEqual({ device: 'pc4f2a', epoch: 0 });
    expect(parseDeviceFile('{"device":"pc4f2a","epoch":-1}')).toEqual({ device: 'pc4f2a', epoch: 0 });
  });

  it('reads none from no file, a damaged one, or an id of another kind', () => {
    expect(parseDeviceFile(null)).toBeNull();
    expect(parseDeviceFile('not json')).toBeNull();
    expect(parseDeviceFile('{"device":"phone9c1e"}')).toBeNull();
  });
});
