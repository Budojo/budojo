import { describe, expect, it } from 'vitest';
import {
  planUpdateCheck,
  updateFailureLine,
  updateReadyMessage,
  type UpdateEnvironment,
} from './update-policy';

const installed: UpdateEnvironment = {
  packaged: true,
  dev: false,
  version: '2.43.0',
};

describe('planUpdateCheck', () => {
  it('checks for updates on a normal installed build', () => {
    expect(planUpdateCheck(installed)).toEqual({ check: true });
  });

  it('refuses in development, so a working tree is never "updated"', () => {
    expect(planUpdateCheck({ ...installed, dev: true })).toEqual({
      check: false,
      reason: 'development run',
    });
  });

  it('refuses when the app is not packaged', () => {
    expect(planUpdateCheck({ ...installed, packaged: false })).toEqual({
      check: false,
      reason: 'not a packaged build',
    });
  });

  it('prefers the dev reason when several apply, so the log says something useful', () => {
    const decision = planUpdateCheck({ packaged: false, dev: true, version: '0.0.0' });

    expect(decision).toEqual({ check: false, reason: 'development run' });
  });
});

describe('updateReadyMessage', () => {
  it('names the version and says the install happens on close', () => {
    const message = updateReadyMessage('2.43.0');

    expect(message.title).toContain('2.43.0');
    expect(message.body).toMatch(/close/i);
  });

  it('never asks the user to restart now', () => {
    // Interrupting an instructor mid-check-in is worse than a day-late update.
    const message = updateReadyMessage('2.43.0');

    expect(`${message.title} ${message.body}`.toLowerCase()).not.toContain('restart now');
  });
});

describe('planUpdateCheck — local builds', () => {
  const installed: UpdateEnvironment = {
    packaged: true,
    dev: false,
    version: '2.43.0',
  };

  it('refuses to update a locally packaged build', () => {
    // Observed for real: `make desktop-package` leaves package.json's 0.0.0
    // placeholder (CI injects the version at release time), so the build under
    // test considers every published release newer and would replace itself.
    expect(planUpdateCheck({ ...installed, version: '0.0.0' })).toEqual({
      check: false,
      reason: 'local build (0.0.0) — not a released version',
    });
  });

  it('updates a real released version', () => {
    expect(planUpdateCheck({ ...installed, version: '2.43.0' })).toEqual({ check: true });
  });
});

describe('updateFailureLine', () => {
  it('keeps only the first line of an updater error', () => {
    // electron-updater messages carry the whole HTTP exchange; an offline
    // laptop wrote ~40 lines per attempt, every six hours.
    const sprawling = [
      'Cannot find latest.yml in the latest release artifacts (…): HttpError: 404',
      '"method: GET url: https://github.com/…"',
      'Headers: {',
      '  "cache-control": "no-cache",',
      '}',
      '    at createHttpError (…)',
    ].join('\n');

    expect(updateFailureLine(sprawling)).toBe(
      'Cannot find latest.yml in the latest release artifacts (…): HttpError: 404',
    );
  });

  it('caps a single very long line', () => {
    expect(updateFailureLine('x'.repeat(500))).toHaveLength(200);
  });

  it('survives an empty message', () => {
    expect(updateFailureLine('')).toBe('');
  });
});
