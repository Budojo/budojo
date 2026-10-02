import type { ClientRuntime } from './runtime';

/**
 * Mobile Angular environment (#2034), swapped in by `fileReplacements` for
 * `ng build --configuration mobile`.
 *
 * `apiBase` is a getter for the desktop's reason: the phone's server listens on
 * whatever loopback port `PhpServerPlugin` bound at start. `main.ts` starts it
 * before Angular boots and publishes the address on `window.__BUDOJO_MOBILE__`.
 *
 * Its own global, not the desktop's `__BUDOJO__`: every desktop-only service
 * (backups, the backup folder, Drive's desktop link, the title bar, updates)
 * switches itself on when `__BUDOJO__` is there, and none of them exists here.
 */
export const environment = {
  runtime: 'mobile' as ClientRuntime,
  production: true,
  get apiBase(): string {
    return window.__BUDOJO_MOBILE__?.apiBase ?? '';
  },
};
