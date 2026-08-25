import {
  loadProgress,
  PROGRESS_STORAGE_KEY,
  LEGACY_PROGRESS_STORAGE_KEY,
  sanitizeProgress,
  saveProgress,
  type LearnerProgress,
} from "../progress.ts";

const DATABASE_NAME = "creatix-learn-linux";
const DATABASE_VERSION = 2;
const STORE_NAME = "learner-state";
const PROGRESS_ID = "progress";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
  });
}

async function readIndexedProgress(): Promise<unknown> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(PROGRESS_ID);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Lecture locale impossible"));
    transaction.oncomplete = () => database.close();
  });
}

async function writeIndexedProgress(progress: LearnerProgress): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(progress, PROGRESS_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Sauvegarde locale impossible"));
  });
  database.close();
}

export async function loadLocalProgress(): Promise<LearnerProgress> {
  const fallback = loadProgress();
  if (typeof indexedDB === "undefined") return fallback;
  try {
    const stored = await readIndexedProgress();
    if (stored) {
      const progress = sanitizeProgress(stored);
      saveProgress(progress);
      return progress;
    }
    await writeIndexedProgress(fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

export async function saveLocalProgress(progress: LearnerProgress): Promise<void> {
  saveProgress(progress);
  if (typeof indexedDB === "undefined") return;
  try {
    await writeIndexedProgress(progress);
  } catch {
    // localStorage reste le filet de sécurité quand IndexedDB est bloqué.
  }
}

export async function replaceLocalProgress(progress: LearnerProgress): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    window.localStorage.removeItem(LEGACY_PROGRESS_STORAGE_KEY);
  }
  await saveLocalProgress(progress);
}
