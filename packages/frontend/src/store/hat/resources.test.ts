import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BoxGeometry, Group, Mesh, MeshPhysicalMaterial, Texture} from 'three';
import {createHatModel, disposeHatModel} from '../hatModel';
import {HatResources} from './resources';

test('disposal releases shared geometry, material arrays and every texture slot once', () => {
  const hat = new Group();
  const geometry = new BoxGeometry();
  const map = new Texture();
  const sheenMap = new Texture();
  const emissiveMap = new Texture();
  const first = new MeshPhysicalMaterial({map, sheenColorMap: sheenMap});
  const second = new MeshPhysicalMaterial({map, emissiveMap});
  const calls = new Map<object, number>();
  for (const item of [geometry, map, sheenMap, emissiveMap, first, second]) {
    item.addEventListener('dispose', () =>
      calls.set(item, (calls.get(item) ?? 0) + 1)
    );
  }
  hat.add(new Mesh(geometry, [first, second]), new Mesh(geometry, first));
  disposeHatModel(hat);
  disposeHatModel(hat);
  assert.equal(calls.size, 6);
  for (const count of calls.values()) assert.equal(count, 1);
});

test('merged intermediate geometries are released before the completed assembly', () => {
  const resources = new HatResources();
  let intermediates = 0;
  const parts = [new BoxGeometry(), new BoxGeometry()].map(part => {
    part.addEventListener('dispose', () => intermediates++);
    return resources.own(part);
  });
  const merged = resources.merge(parts);
  let finished = 0;
  merged.addEventListener('dispose', () => finished++);
  assert.equal(intermediates, 2);
  resources.dispose();
  resources.dispose();
  assert.equal(intermediates, 2);
  assert.equal(finished, 1);
});

test('a failed model build releases allocations in both completed and unfinished parts', t => {
  const allocations = new Map<{dispose(): void}, number>();
  const own = HatResources.prototype.own;
  t.mock.method(HatResources.prototype, 'own', function <
    T extends {dispose(): void},
  >(this: HatResources, item: T) {
    if (!allocations.has(item)) {
      allocations.set(item, 0);
      const dispose = item.dispose.bind(item);
      const disposable: {dispose(): void} = item;
      t.mock.method(disposable, 'dispose', () => {
        allocations.set(item, (allocations.get(item) ?? 0) + 1);
        dispose();
      });
    }
    return own.call(this, item);
  });
  // Node has no canvas: interior artwork fails after crown and visor allocation.
  assert.throws(
    () => createHatModel({front: '', side: '', rear: ''}),
    /document is not defined/
  );
  assert.ok(allocations.size > 20);
  for (const count of allocations.values()) assert.equal(count, 1);
});
