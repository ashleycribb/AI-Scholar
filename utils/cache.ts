
/**
 * Persistent & In-Memory Multi-Tier Cache Utility
 * Provides a memory-backed LRU tier paired with localStorage persistence,
 * automatic TTL expiry, and safe quota-exceeded handling.
 */

interface CacheItem<T> {
    data: T;
    expiry: number;
    size?: number;
}

// In-Memory Cache Tier (prevents quota exceeded exceptions and provides instant access)
const memoryCache = new Map<string, CacheItem<any>>();
const MAX_MEMORY_ITEMS = 500;
const MAX_LOCAL_STORAGE_ITEM_BYTES = 100 * 1024; // 100 KB max per item in localStorage

const ACADEMIC_CACHE_PREFIXES = [
    'oc_',
    'datacite_',
    'openaire_',
    'openalex_',
    'arxiv_',
    'epmc_',
    'dblp_',
    'single_paper_',
    'search_',
    'paper_',
    'scite_'
];

export const getCache = <T>(key: string): T | null => {
    const now = Date.now();

    // 1. Check in-memory cache first (Fastest & immune to localStorage quota)
    if (memoryCache.has(key)) {
        const memItem = memoryCache.get(key)!;
        if (now <= memItem.expiry) {
            return memItem.data as T;
        }
        memoryCache.delete(key);
    }

    // 2. Check localStorage
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;

        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;

        const item: CacheItem<T> = JSON.parse(itemStr);

        if (now > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }

        // Hydrate memory cache
        if (memoryCache.size < MAX_MEMORY_ITEMS) {
            memoryCache.set(key, item);
        }

        return item.data;
    } catch {
        return null;
    }
};

export const setCache = <T>(key: string, data: T, ttlMs: number): void => {
    const now = Date.now();
    const expiry = now + ttlMs;
    const item: CacheItem<T> = { data, expiry };

    // 1. Always set in memory cache
    if (memoryCache.size >= MAX_MEMORY_ITEMS) {
        // Evict oldest entry from memory cache
        const firstKey = memoryCache.keys().next().value;
        if (firstKey) memoryCache.delete(firstKey);
    }
    memoryCache.set(key, item);

    // 2. Persist to localStorage if eligible
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;

        const serialized = JSON.stringify(item);

        // If the payload is too large for localStorage, keep it strictly in memory
        if (serialized.length > MAX_LOCAL_STORAGE_ITEM_BYTES) {
            return;
        }

        try {
            localStorage.setItem(key, serialized);
        } catch {
            // Storage quota exceeded — perform intelligent cleanup
            evictAcademicCache();
            try {
                localStorage.setItem(key, serialized);
            } catch {
                // If it still doesn't fit, memory cache will serve the request safely
            }
        }
    } catch {
        // Silently handled: in-memory cache remains active
    }
};

/**
 * Intelligent Cache Eviction:
 * 1. Cleans up all expired keys across localStorage.
 * 2. If still full, removes older academic registry entries.
 */
const evictAcademicCache = () => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;

        const now = Date.now();
        const academicKeys: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;

            // Check if key belongs to our academic cache
            if (ACADEMIC_CACHE_PREFIXES.some(p => k.startsWith(p))) {
                academicKeys.push(k);
                try {
                    const raw = localStorage.getItem(k);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed?.expiry && now > parsed.expiry) {
                            localStorage.removeItem(k);
                        }
                    }
                } catch {
                    localStorage.removeItem(k);
                }
            }
        }

        // If we still have many academic keys, remove half to free space immediately
        if (academicKeys.length > 20) {
            academicKeys.slice(0, Math.floor(academicKeys.length / 2)).forEach(k => {
                localStorage.removeItem(k);
            });
        }
    } catch {
        // Ignore eviction errors
    }
};

export const clearAllAcademicCache = (): void => {
    memoryCache.clear();
    evictAcademicCache();
};
