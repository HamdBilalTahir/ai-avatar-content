/**
 * IndexedDB wrapper for persisting media blobs across sessions.
 * localStorage can't hold binary files; IndexedDB handles hundreds of MB.
 */

const DB_NAME = 'video-maker-media';
const DB_VERSION = 1;
const STORE = 'media';

interface PersistedMedia {
  id: string;
  name: string;
  type: 'video' | 'audio';
  blob: Blob;
  duration: number;
  thumbnail: string | null; // data URL
  waveform: number[] | null;
  size: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

export async function persistMedia(
  item: Omit<PersistedMedia, 'blob'>,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...item, blob });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadAllMedia(): Promise<
  (Omit<PersistedMedia, 'blob'> & { blob: Blob })[]
> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as PersistedMedia[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function removeMedia(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
