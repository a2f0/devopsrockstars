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
  through the lower third, and the side walls taper toward a shallow apex under
  the button.
- Six panels meet at seams 0°, ±62°, ±120°, and 180° around the base, so the
  front panels are slightly wider than the others.
- The flat visor is 3 mm thick with a rounded edge. It projects 0.80 units
  (0.35 of the crown depth) beyond the crown's front edge and is 2.28 units
  wide, widest 0.22 units behind that edge. Eight stitch rows start 7 mm in
  from the edge, 5.75 mm apart.
- Eyelets sit on each panel centerline about 50 mm along the crown below the
  button.

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
