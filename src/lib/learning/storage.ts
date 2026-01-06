const RECENT_KEY = "learning:recently-viewed";
const QUERY_KEY = "learning:queries";
const RECENT_LIMIT = 50;
const QUERY_LIMIT = 20;

function safeRead(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // ignore write errors (storage disabled)
  }
}

export function getRecentTerms(): string[] {
  return safeRead(RECENT_KEY);
}

export function pushRecentTerm(id: string): string[] {
  const current = safeRead(RECENT_KEY).filter((value) => value !== id);
  current.unshift(id);
  const trimmed = current.slice(0, RECENT_LIMIT);
  safeWrite(RECENT_KEY, trimmed);
  return trimmed;
}

export function getStoredQueries(): string[] {
  return safeRead(QUERY_KEY);
}

export function pushStoredQuery(query: string): string[] {
  const normalized = query.trim();
  if (!normalized) return getStoredQueries();
  const current = safeRead(QUERY_KEY).filter((value) => value.toLowerCase() !== normalized.toLowerCase());
  current.unshift(normalized);
  const trimmed = current.slice(0, QUERY_LIMIT);
  safeWrite(QUERY_KEY, trimmed);
  return trimmed;
}























