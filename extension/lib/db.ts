import type { LocalPaper } from './types';

const DB_NAME = 'ai-research-explorer-db';
const STORE_NAME = 'papers';
const DB_VERSION = 1;

class PaperDatabase {
    private dbPromise: Promise<IDBDatabase>;

    constructor() {
        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('savedAt', 'savedAt');
                }
            };
        });
    }
    
    private getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
        return this.dbPromise.then(db => {
            const transaction = db.transaction(STORE_NAME, mode);
            return transaction.objectStore(STORE_NAME);
        });
    }

    async addPaper(paper: LocalPaper): Promise<void> {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(paper);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getPaper(id: string): Promise<LocalPaper | undefined> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async paperExists(id: string): Promise<boolean> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.count(id);
            request.onsuccess = () => resolve(request.result > 0);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllPapers(): Promise<LocalPaper[]> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const index = store.index('savedAt');
            const request = index.getAll();
            request.onsuccess = () => resolve(request.result.reverse()); // Newest first
            request.onerror = () => reject(request.error);
        });
    }

    async deletePaper(id: string): Promise<void> {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export const db = new PaperDatabase();
