const KEY = 'maple-star:recent:v1';
const TTL = 29 * 24 * 60 * 60000;
export function readRecent(storage = localStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || '[]');
    const clean = (Array.isArray(value) ? value : []).filter((entry) => typeof entry?.name === 'string' && entry.name.length <= 12 && Number.isFinite(entry.savedAt) && entry.savedAt <= now && now - entry.savedAt < TTL).slice(0, 6);
    storage.setItem(KEY, JSON.stringify(clean));
    return clean;
  } catch { return []; }
}
export function saveRecent(name, storage = localStorage, now = Date.now()) {
  const entries = [{ name, savedAt: now }, ...readRecent(storage, now).filter((entry) => entry.name !== name)].slice(0, 6);
  try { storage.setItem(KEY, JSON.stringify(entries)); } catch { /* Private browsing can disallow storage. */ }
  return entries;
}
export function clearRecent(storage = localStorage) { try { storage.removeItem(KEY); } catch { /* Keep lookup usable without storage. */ } }
