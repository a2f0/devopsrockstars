import React, {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router';
import {createCheckout, loadStorefront} from './api';
import {storeOrderToken, useStoreCart} from './cart';
import type {
  CreateCheckoutResponse,
  ShippingInput,
  StorefrontResponse,
} from './contracts';
import {formatMoney} from './format';
import {
  ActionLink,
  Button,
  CheckoutGrid,
  Field,
  FormActions,
  FormGrid,
  FullField,
  Input,
  OrderSummary,
  Section,
  SectionTitle,
  Status,
  StoreHeading,
  StoreShell,
  SummaryRow,
} from './StoreStyles';
import StripePayment from './StripePayment';

const EMPTY_SHIPPING: ShippingInput = {
  name: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
};

const Checkout = React.memo(() => {
  const cart = useStoreCart();
  const navigate = useNavigate();
  const [storefront, setStorefront] = useState<StorefrontResponse | null>(null);
  const [shipping, setShipping] = useState<ShippingInput>(EMPTY_SHIPPING);
  const [checkout, setCheckout] = useState<CreateCheckoutResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadStorefront(controller.signal)
      .then(setStorefront)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          console.error('Failed to load checkout inventory:', loadError);
          setError('The store is temporarily unavailable.');
        }
      });
    return () => controller.abort();
  }, []);

  const variants = useMemo(
    () =>
      new Map(
        storefront?.products.flatMap(product =>
          product.variants.map(variant => [variant.id, {product, variant}])
        ) ?? []
      ),
    [storefront]
  );
  const visibleItems = cart.items.flatMap(item => {
    const entry = variants.get(item.variantId);
    return entry ? [{...item, ...entry}] : [];
  });
  const total = visibleItems.reduce(
    (sum, item) => sum + item.variant.unitAmount * item.quantity,
    0
  );
  const currency = visibleItems[0]?.variant.currency ?? 'usd';
  const checkoutItems = visibleItems.map(item => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }));

  const update = (field: keyof ShippingInput, value: string) => {
    setShipping(current => ({...current, [field]: value}));
  };

  const startPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || checkout) return;
    if (!storefront?.stripePublishableKey) {
      setError('Checkout is not configured yet.');
      return;
    }
    if (checkoutItems.length === 0) {
      setError('The items in your cart are no longer available.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createCheckout({items: checkoutItems, shipping});
      storeOrderToken(result.orderId, result.orderToken);
      setCheckout(result);
    } catch (checkoutError) {
      console.error('Failed to start checkout:', checkoutError);
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Checkout could not be started.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <StoreShell>
        <StoreHeading>checkout</StoreHeading>
        <Status>Your cart is empty.</Status>
        <FormActions>
          <ActionLink to="/store">Back to store</ActionLink>
        </FormActions>
      </StoreShell>
    );
  }

  return (
    <StoreShell>
      <StoreHeading>checkout</StoreHeading>
      <CheckoutGrid>
        <Section>
          <SectionTitle>Shipping</SectionTitle>
          <form onSubmit={startPayment}>
            <FormGrid>
              <FullField>
                Name
                <Input
                  required
                  autoComplete="name"
                  disabled={Boolean(checkout)}
                  maxLength={100}
                  value={shipping.name}
                  onChange={event => update('name', event.currentTarget.value)}
                />
              </FullField>
              <FullField>
                Email
                <Input
                  required
                  autoComplete="email"
                  disabled={Boolean(checkout)}
                  maxLength={254}
                  type="email"
                  value={shipping.email}
                  onChange={event => update('email', event.currentTarget.value)}
                />
              </FullField>
              <FullField>
                Address 1
                <Input
                  required
                  autoComplete="shipping address-line1"
                  disabled={Boolean(checkout)}
                  maxLength={100}
                  value={shipping.addressLine1}
                  onChange={event =>
                    update('addressLine1', event.currentTarget.value)
                  }
                />
              </FullField>
              <FullField>
                Address 2
                <Input
                  autoComplete="shipping address-line2"
                  disabled={Boolean(checkout)}
                  maxLength={100}
                  value={shipping.addressLine2}
                  onChange={event =>
                    update('addressLine2', event.currentTarget.value)
                  }
                />
              </FullField>
              <Field>
                City
                <Input
                  required
                  autoComplete="shipping address-level2"
                  disabled={Boolean(checkout)}
                  maxLength={100}
                  value={shipping.city}
                  onChange={event => update('city', event.currentTarget.value)}
                />
              </Field>
              <Field>
                State
                <Input
                  required
                  autoComplete="shipping address-level1"
                  disabled={Boolean(checkout)}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  value={shipping.state}
                  onChange={event =>
                    update('state', event.currentTarget.value.toUpperCase())
                  }
                />
              </Field>
              <Field>
                ZIP code
                <Input
                  required
                  autoComplete="shipping postal-code"
                  disabled={Boolean(checkout)}
                  maxLength={10}
                  pattern="[0-9]{5}(-[0-9]{4})?"
                  value={shipping.postalCode}
                  onChange={event =>
                    update('postalCode', event.currentTarget.value)
                  }
                />
              </Field>
              <Field>
                Country
                <Input disabled value="United States" />
              </Field>
            </FormGrid>
            {!checkout ? (
              <FormActions>
                <ActionLink to="/store">Back</ActionLink>
                <Button
                  type="submit"
                  disabled={busy || !storefront || checkoutItems.length === 0}
                >
                  {busy ? 'Reserving…' : 'Continue to payment'}
                </Button>
              </FormActions>
            ) : null}
          </form>
        </Section>

        <Section>
          <SectionTitle>Your order</SectionTitle>
          <OrderSummary>
            {visibleItems.map(item => (
              <SummaryRow key={item.variantId}>
                <span>
                  {item.product.name} — {item.variant.label} × {item.quantity}
                </span>
                <span>
                  {formatMoney(
                    item.variant.unitAmount * item.quantity,
                    item.variant.currency
                  )}
                </span>
              </SummaryRow>
            ))}
            <SummaryRow>
              <span>Shipping</span>
              <i>free</i>
            </SummaryRow>
            <SummaryRow>
              <span>Total</span>
              <span>{formatMoney(total, currency)}</span>
            </SummaryRow>
          </OrderSummary>
          {checkout && storefront?.stripePublishableKey ? (
            <>
              <SectionTitle>Payment</SectionTitle>
              <StripePayment
                checkout={checkout}
                publishableKey={storefront.stripePublishableKey}
                shipping={shipping}
                onConfirmed={() =>
                  navigate(`/store/receipt?order=${checkout.orderId}`)
                }
              />
              <Status>
                Reserved until{' '}
                {new Date(checkout.expiresAt).toLocaleTimeString()}.
              </Status>
            </>
          ) : null}
          {error ? <Status $error>{error}</Status> : null}
        </Section>
      </CheckoutGrid>
    </StoreShell>
  );
});

export default Checkout;
