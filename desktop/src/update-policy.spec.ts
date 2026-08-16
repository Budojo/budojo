import { describe, expect, it } from 'vitest';
import { planUpdateCheck, updateReadyMessage, type UpdateEnvironment } from './update-policy';

const installed: UpdateEnvironment = { packaged: true, dev: false, portableDir: undefined };

describe('planUpdateCheck', () => {
  it('checks for updates on a normal installed build', () => {
    expect(planUpdateCheck(installed)).toEqual({ check: true });
  });

  it('refuses on the portable build, which cannot rewrite its own exe', () => {
    // The whole reason this module exists: without the refusal, every portable
    // launch would fail an update attempt it can never complete.
    const decision = planUpdateCheck({ ...installed, portableDir: 'C:\\Users\\x\\Desktop' });

    expect(decision).toEqual({ check: false, reason: 'portable build — updates are manual' });
  });

  it('treats an empty PORTABLE_EXECUTABLE_DIR as not portable', () => {
    // Windows can hand us an empty string rather than an absent variable.
    expect(planUpdateCheck({ ...installed, portableDir: '' })).toEqual({ check: true });
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
    const decision = planUpdateCheck({ packaged: false, dev: true, portableDir: 'C:\\x' });

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
