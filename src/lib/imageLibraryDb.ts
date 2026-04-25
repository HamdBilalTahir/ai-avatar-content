/**
 * IndexedDB store for the Script page Image Library.
 * Persists uploaded images across page reloads so users don't have to
 * re-upload every session. Images are only removed when the user explicitly
 * deletes them from the UI or clears IndexedDB via DevTools.
 */

const DB_NAME = 'script-image-library';
const DB_VERSION = 1;
const STORE = 'images';

interface StoredImage {
  id: string;
  filename: string;
  mimeType: string;
  blob: Blob;
  blobUrl?: string;
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

export async function saveImageToLibrary(
  id: string,
  file: File,
  blobUrl?: string
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      id,
      filename: file.name,
      mimeType: file.type || 'image/jpeg',
      blob: file,
      ...(blobUrl && { blobUrl }),
    } satisfies StoredImage);
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

export async function loadAllLibraryImages(): Promise<
  { id: string; file: File; previewUrl: string; blobUrl?: string }[]
> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(
        (req.result as StoredImage[]).map((item) => {
          const file = new File([item.blob], item.filename, {
            type: item.mimeType,
          });
          return {
            id: item.id,
            file,
            previewUrl: URL.createObjectURL(item.blob),
            blobUrl: item.blobUrl,
          };
        })
      );
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteLibraryImage(id: string): Promise<void> {
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
