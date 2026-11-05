import React, {useEffect, useMemo, useReducer, useState} from 'react';
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
import {
  initialStorefrontAvailability,
  transitionStorefrontAvailability,
} from './storefrontAvailability';

function useStorefront() {
  const [availability, dispatch] = useReducer(
    transitionStorefrontAvailability,
    null,
    () => initialStorefrontAvailability(cachedStorefront(), storedStorefront())
  );

  useEffect(() => {
    let mounted = true;
    void refreshStorefront()
      .then(storefront => {
        if (mounted) dispatch({type: 'refreshed', storefront});
      })
      .catch(loadError => {
        if (mounted) {
          console.error('Failed to load the store:', loadError);
          dispatch({type: 'failed'});
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    storefront:
      availability.status === 'failed' ? null : availability.storefront,
    // A failed refresh leaves inventory availability unverified.
    error:
      availability.status === 'failed'
        ? 'The store is temporarily unavailable.'
        : null,
    inventoryReady: availability.status === 'verified',
  };
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
      <StorePage data-ct-app="store">
        <Status $error>{error}</Status>
      </StorePage>
    );
  }

  if (!storefront) {
    return (
      <StorePage data-ct-app="store">
        <Status>Loading inventory…</Status>
      </StorePage>
    );
  }

  return (
    <StorePage data-ct-app="store">
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
                data-ct="store.add-to-cart"
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
                  data-ct="store.remove-item"
                  type="button"
                  onClick={() => cart.remove(item.variantId)}
                >
                  remove
                </button>
              </CartRow>
            );
          })}
          <CartActions>
            <ActionLink to="/store/checkout" data-ct="store.checkout">
              Checkout
            </ActionLink>
          </CartActions>
        </CartPanel>
      ) : null}
    </StorePage>
  );
});

export default Store;
