export interface SaveSlotMetadata {
  slot: string;
  timestamp: number;
  type: 'manual' | 'autosave';
  label: string;
}

export class SaveManager {
  private dbName = 'PhySimDB';
  private storeName = 'saves';

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'slot' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves metadata list of all existing saves.
   */
  public async getSaveSlots(): Promise<SaveSlotMetadata[]> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        
        req.onsuccess = () => {
          const results = req.result || [];
          const list: SaveSlotMetadata[] = results.map(r => ({
            slot: r.slot,
            timestamp: r.timestamp,
            type: r.type,
            label: r.label
          }));
          // Sort most recent first
          list.sort((a, b) => b.timestamp - a.timestamp);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('Failed to query IndexedDB slots', e);
      return [];
    }
  }

  /**
   * Saves game state into a slot.
   */
  public async saveState(slot: string, type: 'manual' | 'autosave', label: string, data: any): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({
        slot,
        timestamp: Date.now(),
        type,
        label,
        data
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Loads game state from a slot.
   */
  public async loadState(slot: string): Promise<any> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(slot);
      
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Rotates rolling slots to overwrite the oldest save slot when capping at 5.
   */
  public async getNextRollingSlot(_type: 'manual' | 'autosave'): Promise<string> {
    const slots = await this.getSaveSlots();
    // We cap total slots at 5
    if (slots.length < 5) {
      // Find the first slot number from 1 to 5 that is unused
      const usedSlots = new Set(slots.map(s => s.slot));
      for (let i = 1; i <= 5; i++) {
        const slotName = `slot_${i}`;
        if (!usedSlots.has(slotName)) {
          return slotName;
        }
      }
    }

    // Overwrite the oldest slot (last in sorted list)
    return slots[slots.length - 1].slot;
  }
}
