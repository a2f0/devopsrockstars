import {Group, Mesh, type MeshPhysicalMaterial, type Texture} from 'three';
import {createCrown} from './hat/crown';
import {createEmbroidery, frontLogo} from './hat/embroidery';
import {createInterior} from './hat/interior';
import {crownHeight, panelCenter} from './hat/shape';
import {twillField, twillMaps} from './hat/textures';
import {createVisor} from './hat/visor';

export interface HatArtwork {
  front: string;
  side: string;
  rear: string;
}

/**
 * A black New Era 59FIFTY Low Profile with a flat visor, built procedurally
 * and deterministically. Proportions and placements follow the artwork
 * README. `anisotropy` is the texture filtering the renderer supports.
 */
export function createHatModel(artwork: HatArtwork, anisotropy = 8) {
  const hat = new Group();
  try {
    const twill = twillField();
    const maps = twillMaps(twill, anisotropy);
    hat.add(...createCrown(maps, anisotropy));
    hat.add(...createVisor(twill, anisotropy));
    hat.add(...createInterior(maps, anisotropy));
    hat.add(
      ...createEmbroidery(
        frontLogo(artwork.front),
        {
          name: 'Front embroidery',
          theta: 0,
          height: crownHeight * 0.47,
          width: 0.92,
          // The star sits on the front seam; the mark keeps its spacing.
          centerOnPath: 'path3757_2_',
          // Raised satin with a rounded, tube-like cross-section.
          stitching: {shoulder: 0.9, relief: 1.1},
        },
        anisotropy
      )
    );
    // +X is the viewer's right when facing the front (the wearer's left).
    hat.add(
      ...createEmbroidery(
        artwork.side,
        {
          name: 'New Era flag',
          theta: panelCenter(1),
          height: 0.285,
          width: 0.3,
          stitching: {shoulder: 0.45, relief: 0.5},
        },
        anisotropy
      )
    );
    hat.add(
      ...createEmbroidery(
        artwork.rear,
        {
          name: 'MLB Batterman',
          theta: Math.PI,
          height: 0.25,
          width: 0.365,
          stitching: {shoulder: 0.5, relief: 0.6},
        },
        anisotropy
      )
    );
  } catch (error) {
    disposeHatModel(hat);
    throw error;
  }
  return hat;
}

export function disposeHatModel(hat: Group) {
  const materials = new Set<MeshPhysicalMaterial>();
  const textures = new Set<Texture>();
  hat.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    materials.add(object.material);
  });
  for (const material of materials) {
    for (const texture of [
      material.map,
      material.normalMap,
      material.roughnessMap,
    ]) {
      if (texture) textures.add(texture);
    }
    material.dispose();
  }
  // Maps are shared between parts, so each is released once.
  for (const texture of textures) texture.dispose();
}
