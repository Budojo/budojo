/**
 * A complete `window.__BUDOJO__` stub for specs (#1301).
 *
 * The bridge type deliberately makes every channel **required** — that is what
 * stops a half-wired bridge shipping, since adding a channel to the preload
 * without adding it to the type (and vice versa) fails to compile. The cost is
 * that every spec stubbing the bridge breaks whenever a channel is added.
 *
 * Paying that cost in one factory instead of six copy-pasted object literals
 * keeps the guarantee and makes the next channel a one-line change here. Specs
 * override only the channel they exercise:
 *
 *     bridgeWindow.__BUDOJO__ = stubBridge({ backup: { list: async () => [...] } });
 *
 * Every default is inert: it answers in the shape the type promises and does
 * nothing. A spec that forgets to override the channel it is testing gets an
 * empty result, not a passing assertion against a lie.
 */

type Bridge = NonNullable<Window['__BUDOJO__']>;

/**
 * Written out rather than derived with a mapped type. The obvious
 * `Bridge[K] extends object ? Partial<…>` turns `onNavigate` into a
 * `Partial<Function>` — functions are objects to TypeScript — and the whole
 * stub stops being assignable. Explicit is duller and right.
 */
interface BridgeOverrides {
  apiBase?: Bridge['apiBase'];
  platform?: Bridge['platform'];
  onNavigate?: Bridge['onNavigate'];
  token?: Partial<Bridge['token']>;
  backup?: Partial<Bridge['backup']>;
  drive?: Partial<Bridge['drive']>;
  keys?: Partial<Bridge['keys']>;
}

export function stubBridge(overrides: BridgeOverrides = {}): Bridge {
  const base: Bridge = {
    apiBase: '',
    platform: 'win32',
    onNavigate: () => () => undefined,
    token: { get: () => null, set: () => undefined, clear: () => undefined },
    backup: {
      list: async () => [],
      run: async () => ({ ok: false, path: null }),
      restore: async () => ({ ok: false }),
    },
    drive: {
      state: async () => ({ configured: false, linked: false }),
      archives: async () => [],
      link: async () => ({ ok: false, error: 'not_available' }),
      unlink: async () => ({ ok: true }),
      sync: async () => ({ ran: false, reason: 'not_available' }),
    },
    keys: {
      export: async () => ({ ok: false }),
      import: async () => ({ ok: false }),
    },
  };

  return {
    ...base,
    ...overrides,
    token: { ...base.token, ...overrides.token },
    backup: { ...base.backup, ...overrides.backup },
    drive: { ...base.drive, ...overrides.drive },
    keys: { ...base.keys, ...overrides.keys },
  };
}
