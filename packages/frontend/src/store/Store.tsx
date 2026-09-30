import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import React, {useEffect, useMemo, useState} from 'react';
import {useStoreCart} from './cart';
import {formatMoney} from './format';
import PreparedHatPreview from './PreparedHatPreview';
import SizePicker from './SizePicker';
import {
  ActionLink,
  AddToCart,
  CartActions,
  CartPanel,
  CartRow,
  Eyebrow,
  InventoryStatus,
  Price,
  ProductArt,
  ProductCopy,
  ProductDetails,
  ProductGrid,
  Status,
  StorePage,
} from './StoreStyles';
import {
  cachedStorefront,
  refreshStorefront,
  storedStorefront,
} from './storefrontCache';

function useStorefront() {
  const [storefront, setStorefront] = useState<StorefrontResponse | null>(
    storedStorefront
  );
  const [error, setError] = useState<string | null>(null);
  const [inventoryReady, setInventoryReady] = useState(
    () => cachedStorefront() !== null
  );

  useEffect(() => {
    let mounted = true;
    void refreshStorefront()
      .then(result => {
        if (mounted) {
          setStorefront(result);
          setInventoryReady(true);
        }
      })
      .catch(loadError => {
        if (mounted) {
          console.error('Failed to load the store:', loadError);
          // A failed refresh leaves inventory availability unverified.
          setStorefront(null);
          setInventoryReady(false);
          setError('The store is temporarily unavailable.');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {storefront, error, inventoryReady};
}

const Store = React.memo(() => {
  const {storefront, error, inventoryReady} = useStorefront();
  const cart = useStoreCart();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const variants = useMemo(
    () =>
      new Map(
        storefront?.products.flatMap(product =>
          product.variants.map(variant => [variant.id, {product, variant}])
        ) ?? []
      ),
    [storefront]
  );

  if (error) {
    return (
      <StorePage>
        <Status $error>{error}</Status>
      </StorePage>
    );
  }

  if (!storefront) {
    return (
      <StorePage>
        <Status>Loading inventory…</Status>
      </StorePage>
    );
  }

  return (
    <StorePage>
      {!inventoryReady ? (
        <InventoryStatus role="status">Updating inventory…</InventoryStatus>
      ) : null}
      {storefront.products.map(product => {
        const hasHatPreview =
          product.imagePath === '/static/image/store/5950.svg';
        const available = product.variants.filter(
          variant => variant.availableQuantity > 0
        );
        const selectedVariant = available.find(
          item => item.id === selected[product.id]
        );
        const variant = selectedVariant ?? available[0];
        const variantId = variant?.id ?? '';
        const priceVariant = variant ?? product.variants[0];
        return (
          <ProductGrid key={product.id}>
            <ProductArt>
              {hasHatPreview ? (
                <PreparedHatPreview name={product.name} />
              ) : (
                <img src={product.imagePath} alt={product.name} />
              )}
            </ProductArt>
            <ProductCopy>{product.description}</ProductCopy>
            <ProductDetails>
              {priceVariant ? (
                <Price data-product-price>
                  {formatMoney(priceVariant.unitAmount, priceVariant.currency)}
                </Price>
              ) : null}
              <SizePicker
                label={`${product.name} size`}
                choices={available}
                value={variantId}
                onChange={id =>
                  setSelected(current => ({...current, [product.id]: id}))
                }
              />
              <AddToCart
                type="button"
                disabled={!inventoryReady || !variant}
                onClick={() => variant && cart.add(variant.id)}
              >
                {variant ? 'Add to cart' : 'Sold out'}
              </AddToCart>
            </ProductDetails>
          </ProductGrid>
        );
      })}

      {cart.items.length > 0 ? (
        <CartPanel aria-label="Shopping cart">
          <Eyebrow>Your cart</Eyebrow>
          {cart.items.map(item => {
            const entry = variants.get(item.variantId);
            if (!entry) return null;
            return (
              <CartRow key={item.variantId}>
                <span>
                  {entry.product.name} — {entry.variant.label} × {item.quantity}
                </span>
                <span>
                  {formatMoney(
                    entry.variant.unitAmount * item.quantity,
                    entry.variant.currency
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => cart.remove(item.variantId)}
                >
                  remove
                </button>
              </CartRow>
            );
          })}
          <CartActions>
            <ActionLink to="/store/checkout">Checkout</ActionLink>
          </CartActions>
        </CartPanel>
      ) : null}
    </StorePage>
  );
});

export default Store;
