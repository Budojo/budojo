import { compareVersions, isReleaseBuild, newerApk } from './app-update';

/**
 * Which APK is newer than the one running (#2041, PRD § 5.5): the latest
 * GitHub release, read as the GitHub API answers it.
 */
describe('the phone update notice (#2041)', () => {
  const release = (tag: string, assets: string[]) => ({
    tag_name: tag,
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
    it('names the newer release and its APK', () => {
      expect(
        newerApk(
          release('v2.80.0', ['Budojo-Setup-2.80.0.exe', 'Budojo-Android-2.80.0.apk']),
          '2.79.0',
        ),
      ).toEqual({
        version: '2.80.0',
        url: 'https://github.com/Budojo/budojo/releases/download/v2.80.0/Budojo-Android-2.80.0.apk',
      });
    });

    it('says nothing when the phone already runs it, or a newer beta', () => {
      expect(newerApk(release('v2.80.0', ['Budojo-Android-2.80.0.apk']), '2.80.0')).toBeNull();
      expect(
        newerApk(release('v2.80.0', ['Budojo-Android-2.80.0.apk']), '2.81.0-beta.1'),
      ).toBeNull();
    });

    it('says nothing for a release that carries no APK yet: it is still being built', () => {
      expect(newerApk(release('v2.80.0', ['Budojo-Setup-2.80.0.exe']), '2.79.0')).toBeNull();
    });

    it('says nothing for an answer that is not a release', () => {
      expect(newerApk({ message: 'API rate limit exceeded' }, '2.79.0')).toBeNull();
      expect(newerApk(null, '2.79.0')).toBeNull();
      expect(newerApk(release('nightly', ['Budojo-Android-x.apk']), '2.79.0')).toBeNull();
    });

    it('never sends the phone anywhere but GitHub', () => {
      const elsewhere = {
        tag_name: 'v2.80.0',
        assets: [
          { name: 'Budojo-Android-2.80.0.apk', browser_download_url: 'https://example.com/b.apk' },
        ],
      };
      expect(newerApk(elsewhere, '2.79.0')).toBeNull();
    });
  });
});
