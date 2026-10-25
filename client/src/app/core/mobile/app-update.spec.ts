import { compareVersions, isReleaseBuild, newerApk } from './app-update';

/**
 * Which APK is newer than the one running (#2041, PRD § 5.5): the latest
 * GitHub release, read as the GitHub API answers it.
 */
describe('the phone update notice (#2041)', () => {
  const release = (tag: string, assets: string[]) => ({
    tag_name: tag,
    prerelease: tag.includes('-'),
    draft: false,
    html_url: `https://github.com/Budojo/budojo/releases/tag/${tag}`,
    assets: assets.map((name) => ({
      name,
      browser_download_url: `https://github.com/Budojo/budojo/releases/download/${tag}/${name}`,
    })),
  });

  describe('compareVersions', () => {
    it('orders by major, minor and patch, as numbers', () => {
      expect(compareVersions('2.80.0', '2.79.0')).toBeGreaterThan(0);
      expect(compareVersions('2.9.0', '2.10.0')).toBeLessThan(0);
      expect(compareVersions('2.79.1', '2.79.1')).toBe(0);
    });

    it('puts a beta before the release it leads to, and after the one before', () => {
      expect(compareVersions('2.80.0-beta.3', '2.80.0')).toBeLessThan(0);
      expect(compareVersions('2.80.0-beta.3', '2.79.0')).toBeGreaterThan(0);
      expect(compareVersions('2.80.0-beta.10', '2.80.0-beta.9')).toBeGreaterThan(0);
    });
  });

  describe('isReleaseBuild', () => {
    it('is a release or a beta, not a test build or a dev one', () => {
      expect(isReleaseBuild('2.79.0')).toBe(true);
      expect(isReleaseBuild('2.80.0-beta.3')).toBe(true);
      // A PR's test APK: newer code under a lower version, which no release
      // installs over (its versionCode is the commit's time).
      expect(isReleaseBuild('0.0.231')).toBe(false);
      expect(isReleaseBuild('0.0.0-dev')).toBe(false);
      expect(isReleaseBuild('dev')).toBe(false);
    });
  });

  describe('newerApk', () => {
    const apk = (tag: string) =>
      `https://github.com/Budojo/budojo/releases/download/${tag}/Budojo-Android-${tag.slice(1)}.apk`;

    it('names the newest release above the phone, and its APK', () => {
      expect(
        newerApk(
          [
            release('v2.80.0', ['Budojo-Setup-2.80.0.exe', 'Budojo-Android-2.80.0.apk']),
            release('v2.79.0', ['Budojo-Android-2.79.0.apk']),
          ],
          '2.79.0',
        ),
      ).toEqual({ version: '2.80.0', url: apk('v2.80.0') });
    });

    it('offers a phone on a release releases only, never a beta', () => {
      expect(
        newerApk(
          [
            release('v2.81.0-beta.2', ['Budojo-Android-2.81.0-beta.2.apk']),
            release('v2.80.0', ['Budojo-Android-2.80.0.apk']),
          ],
          '2.79.0',
        ),
      ).toEqual({ version: '2.80.0', url: apk('v2.80.0') });
    });

    it('follows the beta train on a phone running a beta: the next beta, or the release', () => {
      const train = [
        release('v2.80.0-beta.2', ['Budojo-Android-2.80.0-beta.2.apk']),
        release('v2.80.0-beta.1', ['Budojo-Android-2.80.0-beta.1.apk']),
        release('v2.79.0', ['Budojo-Android-2.79.0.apk']),
      ];
      expect(newerApk(train, '2.80.0-beta.1')).toEqual({
        version: '2.80.0-beta.2',
        url: apk('v2.80.0-beta.2'),
      });
      expect(
        newerApk([release('v2.80.0', ['Budojo-Android-2.80.0.apk']), ...train], '2.80.0-beta.2'),
      ).toEqual({ version: '2.80.0', url: apk('v2.80.0') });
    });

    it('says nothing when the phone already runs the newest, or a newer beta', () => {
      const latest = [release('v2.80.0', ['Budojo-Android-2.80.0.apk'])];
      expect(newerApk(latest, '2.80.0')).toBeNull();
      expect(newerApk(latest, '2.81.0-beta.1')).toBeNull();
    });

    it('passes over a release that carries no APK yet: it is still being built', () => {
      expect(
        newerApk(
          [
            release('v2.81.0', ['Budojo-Setup-2.81.0.exe']),
            release('v2.80.0', ['Budojo-Android-2.80.0.apk']),
          ],
          '2.79.0',
        ),
      ).toEqual({ version: '2.80.0', url: apk('v2.80.0') });
    });

    it('says nothing for an answer that is not a list of releases', () => {
      expect(newerApk({ message: 'API rate limit exceeded' }, '2.79.0')).toBeNull();
      expect(newerApk(null, '2.79.0')).toBeNull();
      expect(newerApk([release('nightly', ['Budojo-Android-x.apk'])], '2.79.0')).toBeNull();
      expect(
        newerApk([{ ...release('v2.80.0', ['Budojo-Android-2.80.0.apk']), draft: true }], '2.79.0'),
      ).toBeNull();
    });

    it('never sends the phone anywhere but GitHub', () => {
      const elsewhere = {
        tag_name: 'v2.80.0',
        prerelease: false,
        assets: [
          { name: 'Budojo-Android-2.80.0.apk', browser_download_url: 'https://example.com/b.apk' },
        ],
      };
      expect(newerApk([elsewhere], '2.79.0')).toBeNull();
    });
  });
});
