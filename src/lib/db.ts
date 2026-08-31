/* ============================================================
 * 永続化レイヤ
 *  - メタデータ / 文字起こし : localStorage（SQLite の代替として）
 *  - 音声バイナリ           : IndexedDB
 * ============================================================ */
import type { DBShape } from "./types";

const LS_KEY = "koedoku.db.v1";

export function loadDB(): DBShape | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DBShape;
    if (!Array.isArray(parsed.files) || !Array.isArray(parsed.transcripts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDB(db: DBShape) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearDB() {
  localStorage.removeItem(LS_KEY);
}

/* ---------------- IndexedDB (audio blobs) ---------------- */

const IDB_NAME = "koedoku-audio";
const STORE = "audio";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* non-fatal */
  }
}

export async function idbGet(id: string): Promise<Blob | null> {
  try {
    const db = await openIdb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function idbDel(id: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* non-fatal */
  }
}

export async function idbClearAll(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* non-fatal */
  }
}
