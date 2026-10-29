// Cache local (chrome.storage.local) : affichage instantané au lancement, puis rafraîchissement.

export async function readCache(key) {
  try {
    return (await chrome.storage.local.get(key))[key] ?? null;
  } catch {
    return null;
  }
}

export async function writeCache(key, data) {
  try {
    await chrome.storage.local.set({ [key]: { data, at: Date.now() } });
  } catch { /* cache facultatif */ }
}

export const clearCache = () => chrome.storage.local.clear();
