import { InjectionToken } from '@angular/core';

/**
 * Where the mat app keeps what must survive a restart and an update (#2027).
 *
 * The spike only proves the durability; #2034 builds the snapshot and the
 * journal on top. The interface is here so a spec can use a Map, since jsdom
 * has no IndexedDB.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * IndexedDB, the WebView's own database. Capacitor keeps it in the app's
 * private storage, which only uninstalling or "clear data" removes. Installing
 * an update signed with the same key leaves it alone, which is the claim the
 * spike checks on a real phone.
 */
export class IndexedDbStore implements KeyValueStore {
  private database?: Promise<IDBDatabase>;

  constructor(
    private readonly name: string,
    private readonly storeName: string,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(this.storeName).objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      transaction.objectStore(this.storeName).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }
}

export const KEY_VALUE_STORE = new InjectionToken<KeyValueStore>('KEY_VALUE_STORE', {
  providedIn: 'root',
  factory: () => new IndexedDbStore('budojo-mat', 'kv'),
});
