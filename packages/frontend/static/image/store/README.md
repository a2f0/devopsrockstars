# Hat artwork and proportions

The interactive cap is a procedural approximation of the store's black
59FIFTY Low Profile with a flat visor, not a measured manufacturing model. Its
front embroidery comes from `5950.svg`; the six-pointed star (`path3757_2_`) is
centered on the front panel seam while the complete mark retains its original
spacing.

## Shape references

- [New Era's 59FIFTY silhouette guide](https://www.neweracap.com/pages/silhouette-guide-59fifty)
  describes the standard 59FIFTY's flat visor and the Low Profile's structured,
  contoured crown.
- [Authentic Collection 59FIFTY, product 70331909](https://www.neweracap.com/products/new-york-yankees-authentic-collection-59fifty-fitted)
  provides unworn product references for the flat visor:
  [left side](https://cdn.shopify.com/s/files/1/0601/2554/4675/files/70331909_70360398_59FIFTY_MLBAC2017GM_NEYYAN_OTC_LSIDE.jpg?v=1736179442)
  and
  [right side](https://cdn.shopify.com/s/files/1/0601/2554/4675/files/70331909_70360398_59FIFTY_MLBAC2017GM_NEYYAN_OTC_RSIDE.jpg?v=1736179442).
- [Authentic Collection Low Profile 59FIFTY, product 70360653](https://www.neweracap.com/products/new-york-yankees-authentic-collection-low-profile-59fifty-fitted)
  supplies the Low Profile side profile, side flag, and rear Batterman
  placement. Its curved visor is not used for this model.
- [New Era Black Low Profile 59FIFTY, product 70995007](https://www.neweracap.co.uk/products/new-era-black-low-profile-59fifty-fitted-cap-70995007)
  is a blank black polyester Low Profile with a black under-visor.
- [New Era Japan's Low Profile 59FIFTY collection](https://www.neweracap.jp/collections/lp_59fifty)
  photographs caps from the side, back, and underside at a shared scale.
- [New Era's fitted size chart](https://www.neweracap.com/pages/sizing-chart)
  includes Low Profile 59FIFTY. A size 7¼ corresponds to a 57.7 cm head
  circumference. This is a fit measurement, not the cap's outside dimensions.

The official sources above do not specify crown height, visor length, or shell
width/depth. Those model proportions are estimated from the photos. Changing
the selected size does not rescale the preview.

## Model proportions

One model unit is roughly 87 mm: the crown base is 2.30 units deep and 2.16
units wide, about a size 7½ cap.

- The crown is 1.24 units tall, 0.54 of its depth. Its buckram front leans back
  about 15° and rolls into a broad top, the back stays close to vertical
  through the lower third, and the side walls taper toward a shallow apex that
  peaks slightly where the panels gather under the button.
- Six panels meet at seams 0°, ±62°, ±120°, and 180° around the base, so the
  front panels are slightly wider than the others. Topstitching runs 5 mm out
  from each seam on both sides, to within about 3 mm of the 15 mm button.
- The flat visor is 3 mm thick with a rounded edge. It projects 0.80 units
  (0.35 of the crown depth) beyond the crown's front edge and is 2.28 units
  wide, widest 0.22 units behind that edge. Behind the widest point each wing
  is a convex arc that tapers closed 3.5 mm inside the crown wall. Eight
  stitch rows follow offsets of the edge, starting 7 mm in, 5.75 mm apart.
- Eyelets sit on each panel centerline 76 mm along the crown below the button,
  about 0.8 of the crown height. Each is a satin ring about 9.5 mm across
  around a 3 mm hole.
- Inside, 13 mm black seam tapes carry vector-drawn "59FIFTY®" and flag box
  print on a 90 mm repeat that stops 15 mm short of the button rivet. The
  sweatband is about 35 mm tall, with a New Era box label and a 7½ size label
  at the back, and grey perforated buckram backs the two front panels.

Proportions and seam, eyelet, and visor constants live in
`src/store/hat/shape.ts`. The under-visor is black; `undervisorColor` in
`src/store/hat/visor.ts` switches it to the classic light grey.

## Logo sources and placement

- `new-era-flag.svg` uses only the flag path from the
  [official New Era primary SVG](https://www.neweracap.co.uk/cdn/shop/files/NEW_ERA_LOGO_MAIN__updated.svg?v=1749038217),
  recolored white for embroidery. It is 0.30 units (about 26 mm) wide and
  centered on the wearer's left side panel, which is on the right when facing
  the cap's front, with its center 0.285 units above the base.
- `mlb-batterman.svg` uses the
  [official MLB logo SVG](https://www.mlbstatic.com/team-logos/league-on-dark/1.svg),
  with a black and a grey field for a monochrome embroidered badge and the
  separate registration symbol omitted. It is 0.365 units (about 32 mm) wide,
  centered on the rear seam with its bottom about 13 mm above the base.
- The front mark is 0.92 units wide, centered at 0.47 of the crown height.

Embroidery thread colors come from each SVG's fills. These are New Era and MLB
brand marks. The reference photos remain at their original sources; the viewer
serves its SVG artwork locally.

## Surface detail and rendering

The crown uses a seeded diagonal twill with roughly 1.1 mm wales and straight
grain on each developed panel. Most yarn contrast comes from roughness and
normal maps; albedo variation is limited to faint dye variation and sparse
fibres. Visor textures area-filter the weave before baking shallow stitch
grooves at true offsets of the outline. The rolled edge follows its own grain.

Embroidery combines satin columns with 0.45 mm fill rows, tapered relief,
frayed edges, and a 1.5 mm contact shadow. Thin SVG strokes widen to a sewable
thread column. The Batterman's satin border is about 2 mm wide. Interior
printing uses vector glyphs rasterized locally, without loading fonts.

The camera and studio lighting stay fixed while the cap turns. Framing tightens
at side elevations and widens for top and underside views. All meshes share
one physical-material feature set; rendering uses two drawing-buffer pixels
per CSS pixel, capped at 1,048,576 pixels. MSAA is disabled to keep the pipeline
identical across display densities. This supersamples a 1x display but uses
native resolution on a 2x display. The viewer renders only on changes.

Model construction yields to the browser between stages and during texture and
occlusion calculations, using an 8 ms work budget between checkpoints. The cart
remains interactive while the six-pointed star loader is shown. Its animation
respects reduced-motion preferences. Navigating away cancels the build and
releases its partial allocations and graphics context.

A Chromium 152 desktop profile measured 1.6 s construction with 76 timer ticks,
and 2.6 s with 226 ticks at 4x CPU slowdown. The longest observed main-thread
tasks were 282 ms cold and 149 ms throttled; native canvas setup and remaining
synchronous stages still take time. These are desktop measurements, not a
physical mobile-device benchmark.

`hat/resources.ts` owns textures, materials, and geometries from allocation,
including intermediate parts. Model failures release these resources; viewer
failures also release the environment and WebGL context. On failure, the loader
is removed and static hat artwork appears with an unavailable message; purchase
controls remain usable. A persistent live region announces loading, readiness,
and failures to screen readers. The legacy `5950.svg` supplies the front
embroidery and the failure image, but is never the loading placeholder.
Hat unit tests cover assembly cleanup, silhouette
constraints, and SVG stitching. `e2e/specs/hat-preview.spec.ts` checks the loader,
reduced motion, announcements,
cart responsiveness during construction, cancellation, interaction, fresh-load
determinism, SVG-derived thread colors, and fallback behavior.
