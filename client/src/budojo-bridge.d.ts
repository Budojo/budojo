/**
 * The renderer-side view of the Electron preload bridge (`desktop/src/preload.cts`).
 * Present only inside Budojo Desktop; every reader must tolerate `undefined`.
 */
interface BudojoBridge {
  /** `http://127.0.0.1:<port>` of the supervised API; `''` outside Electron. */
  readonly apiBase: string;
  /** Node's `process.platform` of the host. */
  readonly platform: string;
}

interface Window {
  readonly __BUDOJO__?: BudojoBridge;
}
