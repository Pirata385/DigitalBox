/** Per-browser convenience copy of the circuit. Files remain the source of truth. */
export const AUTOSAVE_KEY = 'digitalbox.autosave.v1';

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** The saved text, or null when storage is missing, blocked, or empty. */
export function readAutosave(storage: Storage | undefined = defaultStorage()): string | null {
  try {
    return storage ? storage.getItem(AUTOSAVE_KEY) : null;
  } catch {
    return null;
  }
}

/** Saves the text. Storage failures are ignored, because autosave is only a convenience. */
export function writeAutosave(text: string, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(AUTOSAVE_KEY, text);
  } catch {
    // Quota exceeded or storage blocked: the circuit stays in memory.
  }
}
