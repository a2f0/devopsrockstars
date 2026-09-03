import type {
  StorefrontResponse,
  StoreProduct,
  StoreVariant,
} from '@devopsrockstars/store-contracts';
import type {Env} from './types';

interface CatalogRow {
  readonly available_quantity: number;
  readonly currency: string;
  readonly description: string;
  readonly image_path: string;
  readonly label: string;
  readonly manufacturer: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly sku: string;
  readonly slug: string;
  readonly unit_amount: number;
  readonly variant_id: string;
}

export async function loadCatalog(env: Env): Promise<StorefrontResponse> {
  const result = await env.DB.prepare(
    `SELECT
       p.id AS product_id,
       p.slug,
       p.name AS product_name,
       p.manufacturer,
       p.description,
       COALESCE(
         (SELECT pi.path
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order, pi.id
          LIMIT 1),
         ''
       ) AS image_path,
       v.id AS variant_id,
       v.sku,
       v.label,
       v.unit_amount,
       v.currency,
       v.inventory_quantity AS available_quantity
     FROM products p
     INNER JOIN product_variants v ON v.product_id = p.id
     WHERE p.active = 1 AND v.active = 1
     ORDER BY p.sort_order, p.id, v.sort_order, v.id`
  ).all<CatalogRow>();

  const products = new Map<
    string,
    Omit<StoreProduct, 'variants'> & {variants: StoreVariant[]}
  >();
  for (const row of result.results) {
    let product = products.get(row.product_id);
    if (!product) {
      product = {
        id: row.product_id,
        slug: row.slug,
        name: row.product_name,
        manufacturer: row.manufacturer,
        description: row.description,
        imagePath: row.image_path,
        variants: [],
      };
      products.set(row.product_id, product);
    }
    product.variants.push({
      id: row.variant_id,
      sku: row.sku,
      label: row.label,
      unitAmount: row.unit_amount,
      currency: row.currency,
      availableQuantity: Math.max(0, Math.min(row.available_quantity, 5)),
    });
  }
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY?.trim();
  return {
    products: [...products.values()],
    stripePublishableKey: publishableKey || null,
  };
}
