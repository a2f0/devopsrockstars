import type {BufferGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

interface Disposable {
  dispose(): void;
}

/** Own allocations immediately, including parts not yet attached to a mesh. */
export class HatResources {
  private readonly items = new Set<Disposable>();

  own<T extends Disposable>(item: T): T {
    this.items.add(item);
    return item;
  }

  merge(parts: BufferGeometry[]) {
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('Could not assemble the hat geometry.');
    this.own(merged);
    for (const part of parts) {
      this.items.delete(part);
      part.dispose();
    }
    return merged;
  }

  dispose() {
    for (const item of this.items) item.dispose();
    this.items.clear();
  }
}
