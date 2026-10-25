import { Injectable, InjectionToken, inject, isDevMode, signal } from '@angular/core';
import { VERSION } from '../../../environments/version';
import { appVersionOf } from '../sync/version';
import { isReleaseBuild, LATEST_RELEASE_URL, newerApk, ReleaseApk } from './app-update';

/** Where the update notice looks, injected so its rules can be tested without a phone or GitHub. */
export interface PhoneUpdateSource {
  /** Inside the Android app: the PC has its own updater (#1401). */
  onPhone: boolean;
  /** This build's version, as `appVersionOf` reads its tag. */
  running: string;
  /** The latest release, as GitHub's API answers it. */
  latest(): Promise<unknown>;
}

export const PHONE_UPDATE_SOURCE = new InjectionToken<PhoneUpdateSource>('PHONE_UPDATE_SOURCE', {
  providedIn: 'root',
  factory: () => ({
    onPhone: window.__BUDOJO_MOBILE__ !== undefined,
    running: testVersion() ?? appVersionOf(VERSION.tag),
    // Plain fetch, not HttpClient: a release the phone cannot reach is no
    // reason to show the offline page, which the error interceptor would.
    latest: async () => {
      const response = await fetch(LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      return response.ok ? response.json() : null;
    },
  }),
});

/**
 * The version a Cypress spec runs as (#2041): the e2e app is a dev build,
 * whose `dev` tag never asks. Only inside Cypress, as `budojoSync` is; a
 * shipped build never has it.
 */
function testVersion(): string | null {
  if (!isDevMode() || !('Cypress' in window)) {
    return null;
  }
  const version = (window as { budojoVersion?: unknown }).budojoVersion;
  return typeof version === 'string' ? version : null;
}

/**
 * The phone's update notice (#2041): asked once per launch, by a release
 * build inside the Android app. GitHub allows 60 unauthenticated reads an
 * hour per address, and a phone opens Budojo a few times a day.
 */
@Injectable({ providedIn: 'root' })
export class PhoneUpdateService {
  private readonly source = inject(PHONE_UPDATE_SOURCE);
  private checked = false;

  /** The newer APK, once GitHub answered with one. */
  readonly available = signal<ReleaseApk | null>(null);

  check(): void {
    if (this.checked || !this.source.onPhone || !isReleaseBuild(this.source.running)) {
      return;
    }
    this.checked = true;
    this.source.latest().then(
      (release) => this.available.set(newerApk(release, this.source.running)),
      () => {
        // No network, or GitHub refused: the notice waits for the next launch.
      },
    );
  }
}
