import { v4 as uuidv4 } from 'uuid';

export interface StoredImage {
  id: string;
  originalName: string;
  mimeType: 'image/jpeg' | 'image/png';
  buffer: Buffer;
  size: number;
  uploadedAt: number;
}

// Pure in-memory store — nothing is written to disk
// Images live only as long as the server process is running
class ImageStore {
  private store = new Map<string, StoredImage>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour auto-eviction

  constructor() {
    // Sweep expired images every 10 minutes
    setInterval(() => this.evict(), 10 * 60 * 1000);
  }

  add(originalName: string, mimeType: 'image/jpeg' | 'image/png', buffer: Buffer): StoredImage {
    const id = uuidv4();
    const image: StoredImage = {
      id,
      originalName,
      mimeType,
      buffer,
      size: buffer.length,
      uploadedAt: Date.now(),
    };
    this.store.set(id, image);
    return image;
  }

  get(id: string): StoredImage | undefined {
    return this.store.get(id);
  }

  getMany(ids: string[]): (StoredImage | undefined)[] {
    return ids.map((id) => this.store.get(id));
  }

  remove(id: string): void {
    this.store.delete(id);
  }

  private evict(): void {
    const cutoff = Date.now() - this.TTL_MS;
    for (const [id, image] of this.store.entries()) {
      if (image.uploadedAt < cutoff) {
        this.store.delete(id);
      }
    }
  }

  size(): number {
    return this.store.size;
  }
}

// Singleton store shared across all routes
export const imageStore = new ImageStore();
