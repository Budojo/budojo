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
  it('names a version by its number, its device and its parent, and reads all three back', () => {
    const version = { seq: 45, device: 'phone9c1e', parent: { seq: 44, device: 'pc4f2a' } };

    const path = versionPath(version);

    expect(path).toBe('versions/000045-phone9c1e.000044-pc4f2a.bjs');
    expect(parseVersionPath(path)).toEqual(version);
  });

  it('names an academy’s first version as a root', () => {
    const path = versionPath({ seq: 1, device: 'pc4f2a', parent: null });

    expect(path).toBe('versions/000001-pc4f2a.root.bjs');
    expect(parseVersionPath(path)).toEqual({ seq: 1, device: 'pc4f2a', parent: null });
  });

  it('sorts version paths in sequence order', () => {
    const paths = [9, 120, 42]
      .map((seq) =>
        versionPath({ seq, device: 'pc4f2a', parent: { seq: seq - 1, device: 'pc4f2a' } }),
      )
      .sort();

    expect(paths.map((path) => parseVersionPath(path)?.seq)).toEqual([9, 42, 120]);
  });

  it('refuses a parent that is not earlier, in a path or to make one', () => {
    expect(parseVersionPath('versions/000044-pc4f2a.000044-phone9c1e.bjs')).toBeNull();
    expect(() =>
      versionPath({ seq: 44, device: 'pc4f2a', parent: { seq: 45, device: 'pc4f2a' } }),
    ).toThrow();
  });

  it('ignores anything else in the versions folder', () => {
    expect(parseVersionPath('versions/notes.txt')).toBeNull();
    expect(parseVersionPath('versions/000000-pc4f2a.root.bjs')).toBeNull();
    expect(parseVersionPath('versions/000042-pc4f2a.bjs')).toBeNull();
    expect(parseVersionPath('files/000042-pc4f2a.root.bjs')).toBeNull();
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

  it('lets a remote write only the paths the protocol defines, folder by folder', () => {
    const accepted = [
      'folder.bjs',
      versionPath({ seq: 1, device: 'pc4f2a', parent: null }),
      `files/${'ab'.repeat(32)}.bjs`,
      'devices/phone9c1e.bjs',
    ];
    const refused = [
      '../folder.bjs',
      'other/x.bjs',
      'versions/a/b.bjs',
      'versions/foo.bjs',
      'files/foo.bjs',
      'devices/foo.bjs',
      'devices/PC4F2A.bjs',
      'keys.json',
    ];

    for (const path of accepted) {
      expect(() => assertLayoutPath(path)).not.toThrow();
    }
    for (const path of refused) {
      expect(() => assertLayoutPath(path)).toThrow('not a path in the sync folder');
    }
  });
});
