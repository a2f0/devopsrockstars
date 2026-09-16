import {Group, Mesh, Texture} from 'three';
import {createCrown} from './hat/crown';
import {createEmbroidery, frontLogo} from './hat/embroidery';
import {createInterior} from './hat/interior';
import {HatResources} from './hat/resources';
import {crownHeight, panelCenter} from './hat/shape';
import {twillField, twillMaps} from './hat/textures';
import {createVisor} from './hat/visor';

const modelResources = new WeakMap<Group, HatResources>();

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
  const resources = new HatResources();
  try {
    const twill = twillField();
    const maps = twillMaps(resources, twill, anisotropy);
    hat.add(...createCrown(resources, maps, anisotropy));
    hat.add(...createVisor(resources, twill, anisotropy));
    hat.add(...createInterior(resources, maps, anisotropy));
    // Marks are sewn through the crown built so far.
    const fabric = [...hat.children];
    hat.add(
      ...createEmbroidery(
        resources,
        frontLogo(artwork.front),
        {
          name: 'Front embroidery',
          theta: 0,
          height: crownHeight * 0.47,
          width: 0.92,
          // The star sits on the front seam; the mark keeps its spacing.
          centerOnPath: 'path3757_2_',
          // Satin on narrow strokes, fill rows across the broad star.
          stitching: {relief: 1.2, satinWidth: 8},
        },
        anisotropy,
        fabric
      )
    );
    // +X is the viewer's right when facing the front (the wearer's left).
    hat.add(
      ...createEmbroidery(
        resources,
        artwork.side,
        {
          name: 'New Era flag',
          theta: panelCenter(1),
          height: 0.285,
          width: 0.3,
          // Flat satin.
          stitching: {relief: 0.35, satinWidth: 4},
        },
        anisotropy,
        fabric
      )
    );
    hat.add(
      ...createEmbroidery(
        resources,
        artwork.rear,
        {
          name: 'MLB Batterman',
          theta: Math.PI,
          height: 0.25,
          width: 0.365,
          // A satin border around fill-stitched fields and batter.
          stitching: {relief: 0.6, satinWidth: 3},
        },
        anisotropy,
        fabric
      )
    );
  } catch (error) {
    resources.dispose();
    throw error;
  }
  modelResources.set(hat, resources);
  return hat;
}

/** Releases every geometry, material and texture in a hat built above. */
export function disposeHatModel(hat: Group) {
  const resources = modelResources.get(hat) ?? new HatResources();
  hat.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const {geometry, material}: Mesh = object;
    resources.own(geometry);
    for (const item of Array.isArray(material) ? material : [material]) {
      resources.own(item);
      // Include every slot, even textures attached after construction.
      for (const value of Object.values(item)) {
        if (value instanceof Texture) resources.own(value);
      }
    }
  });
  resources.dispose();
  hat.clear();
  modelResources.delete(hat);
}
