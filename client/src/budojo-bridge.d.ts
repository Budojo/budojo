/**
 * The renderer-side view of the Electron preload bridge (`desktop/src/preload.cts`).
 * Present only inside Budojo Desktop; every reader must tolerate `undefined`.
 */
interface BudojoBridge {
  /** `http://127.0.0.1:<port>` of the supervised API; `''` outside Electron. */
  readonly apiBase: string;
  /** Node's `process.platform` of the host. */
  readonly platform: string;
  /**
   * Subscribes to in-app navigation requests raised by the main process — a
   * clicked native toast (#1225). Paths only (`/dashboard/...`); the renderer
   * still owns routing. Returns the unsubscribe function.
   */
  onNavigate(callback: (path: string) => void): () => void;
}

interface Window {
  readonly __BUDOJO__?: BudojoBridge;
}
