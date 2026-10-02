import { InjectionToken } from '@angular/core';
import { driveAuthPlugin, DriveAuthPlugin } from './drive-auth';
import { PcBackups } from './pc-backups';
import { phpServerPlugin, PhpServerPlugin } from './phone-server';

/**
 * The phone shell's plugins, injected so that the door can be tested with
 * fakes (#2079). Null anywhere but inside the Android app.
 */
export const PHP_SERVER = new InjectionToken<PhpServerPlugin | null>('PHP_SERVER', {
  providedIn: 'root',
  factory: phpServerPlugin,
});

export const DRIVE_AUTH = new InjectionToken<DriveAuthPlugin | null>('DRIVE_AUTH', {
  providedIn: 'root',
  factory: driveAuthPlugin,
});

/** Makes the reader of the PC's backups on Drive, with a way to get a token. */
export const PC_BACKUPS = new InjectionToken<(token: () => Promise<string>) => PcBackups>(
  'PC_BACKUPS',
  { providedIn: 'root', factory: () => (token) => new PcBackups(token) },
);
