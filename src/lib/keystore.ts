/**
 * Host signing key storage. The private key is kept as a NON-EXTRACTABLE CryptoKey in IndexedDB: page script (including an XSS payload)
 * can ask it to sign while the page is open, but can never read the key bytes, and the bytes are not in localStorage or in any log.
 * The exportable PKCS#8 form exists only once, at creation, for the listener (shown once, then dropped from memory).
 * If IndexedDB is unavailable (private mode) the key lives in memory for this tab only.
 */
const DB = "atm-keys";
const STORE = "k";
const ID = "host";
export interface StoredKeys { publicKey: string; signKey: CryptoKey }
let mem: StoredKeys | null = null;

const idb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const rq = f(db.transaction(STORE, mode).objectStore(STORE));
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  } finally {
    db.close();
  }
}

export async function saveKeys(k: StoredKeys): Promise<boolean> {
  mem = k;
  try {
    await tx("readwrite", (s) => s.put(k, ID));
    return true;
  } catch {
    return false; // kept in memory only
  }
}

export async function loadKeys(): Promise<StoredKeys | null> {
  try {
    const k = (await tx("readonly", (s) => s.get(ID))) as StoredKeys | undefined;
    if (k && typeof k.publicKey === "string" && k.signKey) return k;
  } catch { /* fall through */ }
  return mem;
}

export async function clearKeys(): Promise<void> {
  mem = null;
  try { await tx("readwrite", (s) => s.delete(ID)); } catch { /* nothing stored */ }
}
