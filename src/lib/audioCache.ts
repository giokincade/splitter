// Audio cache using IndexedDB for large audio files

interface CachedAudioData {
  fileHash: string;
  fileName: string;
  fileSize: number;
  fileModified: number;
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
  cachedAt: number;
}

class AudioCache {
  private dbName = 'AudioSplitterCache';
  private dbVersion = 1;
  private storeName = 'audioData';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'fileHash' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
    });
  }

  private async generateFileHash(file: File): Promise<string> {
    // Create a simple hash based on file properties and first few bytes
    const firstChunk = await file.slice(0, 1024).arrayBuffer();
    const hashInput = `${file.name}-${file.size}-${file.lastModified}-${new Uint8Array(firstChunk).slice(0, 100).join(',')}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  async getCachedAudio(file: File): Promise<CachedAudioData | null> {
    if (!this.db) await this.init();
    
    const fileHash = await this.generateFileHash(file);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(fileHash);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cached = request.result as CachedAudioData | undefined;
        
        if (cached) {
          // Verify the cached data is still valid
          if (cached.fileName === file.name && 
              cached.fileSize === file.size &&
              cached.fileModified === file.lastModified) {
            resolve(cached);
          } else {
            // File has changed, remove stale cache
            this.removeCachedAudio(fileHash);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
    });
  }

  async setCachedAudio(
    file: File, 
    audioData: Float32Array, 
    sampleRate: number, 
    duration: number
  ): Promise<void> {
    if (!this.db) await this.init();
    
    const fileHash = await this.generateFileHash(file);
    const cached: CachedAudioData = {
      fileHash,
      fileName: file.name,
      fileSize: file.size,
      fileModified: file.lastModified,
      audioData,
      sampleRate,
      duration,
      cachedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(cached);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async removeCachedAudio(fileHash: string): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(fileHash);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.db) await this.init();
    
    const cutoffTime = Date.now() - maxAgeMs;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('cachedAt');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  async getCacheSize(): Promise<{ count: number; estimatedSizeMB: number }> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const items = request.result as CachedAudioData[];
        const totalBytes = items.reduce((sum, item) => sum + (item.audioData.byteLength || 0), 0);
        
        resolve({
          count: items.length,
          estimatedSizeMB: totalBytes / (1024 * 1024)
        });
      };
    });
  }
}

export const audioCache = new AudioCache();