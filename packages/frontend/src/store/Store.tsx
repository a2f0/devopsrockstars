import React, {useEffect, useMemo, useState} from 'react';
import {loadStorefront} from './api';
import {useStoreCart} from './cart';
import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import {formatMoney} from './format';
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
  StoreHeading,
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
        <StoreHeading>store</StoreHeading>
        <Status $error>{error}</Status>
      </StorePage>
    );
  }

  if (!storefront) {
    return (
      <StorePage>
        <StoreHeading>store</StoreHeading>
        <Status>Loading inventory…</Status>
      </StorePage>
    );
  }

  return (
    <StorePage>
      <StoreHeading>store</StoreHeading>
      {storefront.products.map(product => {
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
              <img src={product.imagePath} alt={product.name} />
            </ProductArt>
            <ProductCopy>{product.description}</ProductCopy>
            <ProductDetails>
              {priceVariant ? (
                <Price>
                  {formatMoney(priceVariant.unitAmount, priceVariant.currency)}
                </Price>
              ) : null}
              <Field>
                Size
                <Select
                  aria-label={`${product.name} size`}
                  disabled={available.length === 0}
                  value={variantId}
                  onChange={event =>
                    setSelected(current => ({
                      ...current,
                      [product.id]: event.currentTarget.value,
                    }))
                  }
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
