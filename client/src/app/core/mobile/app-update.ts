/**
 * Which APK is newer than the one running (#2041, PRD § 5.5). The phone
 * reads the latest GitHub release; one tap downloads its APK, and Android
 * asks for the confirmation.
 */

/** GitHub's newest release that is neither a draft nor a beta. */
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/Budojo/budojo/releases/latest';

export interface ReleaseApk {
  version: string;
  url: string;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Only GitHub's own download address: the notice never sends the phone elsewhere. */
const DOWNLOAD =
  /^https:\/\/github\.com\/Budojo\/budojo\/releases\/download\/[^/]+\/Budojo-Android-[^/]+\.apk$/;

/**
 * Semver order: major, minor, patch as numbers; a version with a pre-release
 * (`2.80.0-beta.3`) comes before the release it leads to.
 */
export function compareVersions(a: string, b: string): number {
  const left = SEMVER.exec(a);
  const right = SEMVER.exec(b);
  if (left === null || right === null) {
    return 0;
  }
  for (let i = 1; i <= 3; i++) {
    const difference = Number(left[i]) - Number(right[i]);
    if (difference !== 0) {
      return difference;
    }
  }
  return comparePreRelease(left[4], right[4]);
}

function comparePreRelease(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) {
    return a === b ? 0 : a === undefined ? 1 : -1;
  }
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined || right[i] === undefined) {
      return left[i] === undefined ? -1 : 1;
    }
    const numeric = /^\d+$/.test(left[i]) && /^\d+$/.test(right[i]);
    const difference = numeric
      ? Number(left[i]) - Number(right[i])
      : left[i].localeCompare(right[i]);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * A release or a beta. A PR's test APK (`0.0.231`) is newer code under a
 * lower version, and no release installs over it: its versionCode is the
 * commit's time (mobile-apk.yml). A dev build is neither.
 */
export function isReleaseBuild(version: string): boolean {
  const match = SEMVER.exec(version);
  return match !== null && Number(match[1]) >= 1;
}

/** The APK of a release newer than `running`, or null: an answer that is not a release is nothing. */
export function newerApk(release: unknown, running: string): ReleaseApk | null {
  if (typeof release !== 'object' || release === null) {
    return null;
  }
  const { tag_name: tag, assets } = release as { tag_name?: unknown; assets?: unknown };
  if (typeof tag !== 'string' || !Array.isArray(assets)) {
    return null;
  }
  const version = tag.replace(/^v/, '');
  if (!SEMVER.test(version) || compareVersions(version, running) <= 0) {
    return null;
  }
  for (const asset of assets as { browser_download_url?: unknown }[]) {
    const url = asset?.browser_download_url;
    if (typeof url === 'string' && DOWNLOAD.test(url)) {
      return { version, url };
    }
  }
  return null;
}
