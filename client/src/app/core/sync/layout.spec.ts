import {
  devicePath,
  filePath,
  isDeviceId,
  newDeviceId,
  parseFilePath,
  parseVersionPath,
  versionPath,
} from './layout';
import { assertLayoutPath } from './remote';

describe('the sync folder layout (#2029)', () => {
  it('names a version by six digits and its device, and reads it back', () => {
    const path = versionPath({ seq: 42, device: 'pc4f2a' });

    expect(path).toBe('versions/000042-pc4f2a.bjs');
    expect(parseVersionPath(path)).toEqual({ seq: 42, device: 'pc4f2a' });
  });

  it('sorts version paths in sequence order', () => {
    const paths = [9, 120, 42].map((seq) => versionPath({ seq, device: 'pc4f2a' })).sort();

    expect(paths.map((path) => parseVersionPath(path)?.seq)).toEqual([9, 42, 120]);
  });

  it('ignores anything else in the versions folder', () => {
    expect(parseVersionPath('versions/notes.txt')).toBeNull();
    expect(parseVersionPath('versions/000000-pc4f2a.bjs')).toBeNull();
    expect(parseVersionPath('files/000042-pc4f2a.bjs')).toBeNull();
  });

  it('names a file by its SHA-256', () => {
    const sha = 'ab'.repeat(32);

    expect(filePath(sha)).toBe(`files/${sha}.bjs`);
    expect(parseFilePath(filePath(sha))).toBe(sha);
    expect(() => filePath('AB'.repeat(32))).toThrow('SHA-256');
  });

  it('makes device ids short, safe and different', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newDeviceId('phone')));

    expect([...ids].every(isDeviceId)).toBe(true);
    expect(ids.size).toBeGreaterThan(45);
    expect(devicePath('phone9c1e')).toBe('devices/phone9c1e.bjs');
    expect(() => newDeviceId('PC')).toThrow();
    expect(isDeviceId('../keys')).toBe(false);
  });

  it('lets a remote write only inside the layout', () => {
    expect(() => assertLayoutPath('keys.bjs')).not.toThrow();
    expect(() => assertLayoutPath(versionPath({ seq: 1, device: 'pc4f2a' }))).not.toThrow();
    for (const path of [
      '../keys.bjs',
      'other/x.bjs',
      'versions/a/b.bjs',
      'versions/x.zip',
      'keys.json',
    ]) {
      expect(() => assertLayoutPath(path)).toThrow('not a path in the sync folder');
    }
  });
});
