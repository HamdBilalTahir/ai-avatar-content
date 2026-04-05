/**
 * IndexedDB store for generated shot videos.
 * Persists video blobs across sessions so Vercel's ephemeral /tmp doesn't
 * lose videos on cold starts.
 */

const DB_NAME = 'script-generated-videos';
const DB_VERSION = 1;
const STORE = 'videos';

interface StoredVideo {
  id: string; // e.g. "shot_1_(2).mp4"
  blob: Blob;
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

export async function saveGeneratedVideo(
  id: string,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, blob });
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

export async function loadAllGeneratedVideos(): Promise<
  { id: string; blobUrl: string }[]
> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(
        (req.result as StoredVideo[]).map((v) => ({
          id: v.id,
          blobUrl: URL.createObjectURL(v.blob),
        }))
      );
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteGeneratedVideo(id: string): Promise<void> {
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
