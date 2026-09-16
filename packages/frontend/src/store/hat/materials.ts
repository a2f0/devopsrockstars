import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  type ColorRepresentation,
  DoubleSide,
  MeshPhysicalMaterial,
  Vector2,
} from 'three';
import type {HatResources} from './resources';
import type {SurfaceMaps} from './textures';

// Dyed black polyester. Neutral tone mapping crushes the darkest values, so
// the albedo sits a little above the visual black.
export const fabricColor = '#161616';

export interface ClothOptions {
  color: ColorRepresentation;
  maps: SurfaceMaps;
  roughness?: number;
  normalScale?: number;
  sheen?: number;
  sheenColor?: ColorRepresentation;
  sheenRoughness?: number;
  specularIntensity?: number;
  metalness?: number;
}

/**
 * Every mesh on the hat uses this one material feature set (maps, normal
 * map, roughness map, vertex occlusion, sheen, double sided), so software
 * renderers compile a single shader program; parts differ only in uniforms.
 */
export function clothMaterial(
  resources: HatResources,
  {
    color,
    maps,
    roughness = 1,
    normalScale = 0.3,
    sheen = 1,
    sheenColor = '#555555',
    sheenRoughness = 0.6,
    specularIntensity = 0.65,
    metalness = 0,
  }: ClothOptions
) {
  return resources.own(
    new MeshPhysicalMaterial({
      color,
      ...maps,
      roughness,
      metalness,
      normalScale: new Vector2(normalScale, normalScale),
      sheen,
      sheenColor: new Color(sheenColor),
      sheenRoughness,
      specularIntensity,
      vertexColors: true,
      side: DoubleSide,
    })
  );
}

/** Vertex colors carry baked occlusion; start fully unoccluded. */
export function withOcclusion(geometry: BufferGeometry, value = 1) {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'color',
    new BufferAttribute(new Float32Array(count * 3).fill(value), 3)
  );
  return geometry;
}
