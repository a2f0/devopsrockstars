import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {loadStorefront} from './api';
import {useStoreCart} from './cart';
import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import {formatMoney} from './format';
import HatPreview, {type HatPreviewStatus} from './HatPreview';
import {
  ActionLink,
  Button,
  CartActions,
  CartPanel,
  CartRow,
  Eyebrow,
  Field,
  Price,
  ProductArt,
  ProductCopy,
  ProductDetails,
  ProductGrid,
  Select,
  Status,
  StorePage,
} from './StoreStyles';

function useStorefront() {
  const [storefront, setStorefront] = useState<StorefrontResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadStorefront(controller.signal)
      .then(setStorefront)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          console.error('Failed to load the store:', loadError);
          setError('The store is temporarily unavailable.');
        }
      });
    return () => controller.abort();
  }, []);

  return {storefront, error};
}

const Store = React.memo(() => {
  const {storefront, error} = useStorefront();
  const cart = useStoreCart();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [previewStatuses, setPreviewStatuses] = useState<
    Record<string, HatPreviewStatus>
  >({});
  const setPreviewStatus = useCallback(
    (productId: string, status: HatPreviewStatus) => {
      setPreviewStatuses(current =>
        current[productId] === status
          ? current
          : {...current, [productId]: status}
      );
    },
    []
  );
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
      {storefront.products.map(product => {
        const hasHatPreview =
          product.imagePath === '/static/image/store/5950.svg';
        const previewIsLoading =
          hasHatPreview &&
          previewStatuses[product.id] !== 'ready' &&
          previewStatuses[product.id] !== 'unavailable';
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
                <HatPreview
                  src={product.imagePath}
                  name={product.name}
                  onStatusChange={status =>
                    setPreviewStatus(product.id, status)
                  }
                />
              ) : (
                <img src={product.imagePath} alt={product.name} />
              )}
            </ProductArt>
            <ProductCopy $hidden={previewIsLoading}>
              {product.description}
            </ProductCopy>
            <ProductDetails>
              {priceVariant ? (
                <Price $hidden={previewIsLoading} data-product-price>
                  {formatMoney(priceVariant.unitAmount, priceVariant.currency)}
                </Price>
              ) : null}
              <Field $hidden={previewIsLoading}>
                Size
                <Select
                  aria-label={`${product.name} size`}
                  disabled={available.length === 0}
                  value={variantId}
                  onChange={event => {
                    // Read the value before the updater runs: React clears
                    // currentTarget once the handler returns.
                    const nextVariantId = event.currentTarget.value;
                    setSelected(current => ({
                      ...current,
                      [product.id]: nextVariantId,
                    }));
                  }}
                >
                  {available.length === 0 ? (
                    <option value="">Sold out</option>
                  ) : null}
                  {available.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                $hidden={previewIsLoading}
                type="button"
                disabled={!variant}
                onClick={() => variant && cart.add(variant.id)}
              >
                {variant ? 'Add to cart' : 'Sold out'}
              </Button>
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
