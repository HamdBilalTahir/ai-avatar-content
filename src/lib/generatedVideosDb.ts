/**
 * IndexedDB store for generated shot videos.
 * Persists video blobs across sessions so Vercel's ephemeral /tmp doesn't
 * lose videos on cold starts.
 *
 * Keys are scoped per thread: `${threadId}:${filename}`
 */

const DB_NAME = 'script-generated-videos';
const DB_VERSION = 1;
const STORE = 'videos';

interface StoredVideo {
  id: string; // e.g. "t_1234567890:shot_1_(2).mp4"
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
  threadId: string,
  filename: string,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: `${threadId}:${filename}`, blob });
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

export async function loadGeneratedVideosByThread(
  threadId: string
): Promise<{ id: string; blobUrl: string }[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const prefix = `${threadId}:`;
      resolve(
        (req.result as StoredVideo[])
          .filter((v) => v.id.startsWith(prefix))
          .map((v) => ({
            id: v.id.slice(prefix.length), // return just the filename
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

/** One-time migration: re-key bare-filename records under the given threadId prefix. */
export async function migrateVideosToThread(threadId: string): Promise<void> {
  const db = await openDb();
  const all: StoredVideo[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredVideo[]);
    req.onerror = () => reject(req.error);
  });

  const bare = all.filter((v) => !v.id.includes(':'));
  if (bare.length === 0) {
    db.close();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    bare.forEach((v) => {
      store.delete(v.id);
      store.put({ id: `${threadId}:${v.id}`, blob: v.blob });
    });
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

export async function deleteGeneratedVideo(
  threadId: string,
  filename: string
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(`${threadId}:${filename}`);
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
