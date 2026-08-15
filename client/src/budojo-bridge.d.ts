interface BackupArchive {
  readonly name: string;
  readonly path: string;
  readonly createdAt: string;
  readonly sizeBytes: number;
}

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
  /**
   * Synchronous access to the Sanctum bearer token, held encrypted in the OS
   * keychain by the main process (#1227). Present only inside Budojo Desktop.
   */
  readonly token: {
    get(): string | null;
    set(token: string): void;
    clear(): void;
  };
  /** Local backup & restore (#1228). Present only inside Budojo Desktop. */
  readonly backup: {
    list(): Promise<BackupArchive[]>;
    run(): Promise<{ ok: boolean; path: string | null }>;
    restore(name: string): Promise<{ ok: boolean; reason?: string }>;
  };
  /**
   * Recovery-key export/import (#1254). `export` decrypts the OS-keychain key
   * store into a single copy-pasteable code; `import` writes a provided code's
   * keys back and relaunches the app under them. Present only inside Budojo
   * Desktop — the one way to move the document-decryption keys to a new machine.
   */
  readonly keys: {
    export(): Promise<{ ok: boolean; code?: string; reason?: string }>;
    import(code: string): Promise<{ ok: boolean; reason?: string }>;
  };
}

interface Window {
  readonly __BUDOJO__?: BudojoBridge;
}
