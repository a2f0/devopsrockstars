import React, {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router';
import {cancelCheckout, createCheckout, loadStorefront} from './api';
import {useStoreCart} from './cart';
import type {
  CreateCheckoutResponse,
  ShippingInput,
  StorefrontResponse,
} from '@devopsrockstars/store-contracts';
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
import {
  clearPendingCheckout,
  getCheckoutClientToken,
  readPendingCheckout,
  storeOrderToken,
  storePendingCheckout,
} from './storage';

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
  const [pendingCheckout] = useState(readPendingCheckout);
  const [storefront, setStorefront] = useState<StorefrontResponse | null>(null);
  const [shipping, setShipping] = useState<ShippingInput>(
    pendingCheckout?.shipping ?? EMPTY_SHIPPING
  );
  const [checkout, setCheckout] = useState<CreateCheckoutResponse | null>(
    pendingCheckout?.checkout ?? null
  );
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);

  useEffect(() => {
    if (!checkout) return;
    const delay = Date.parse(checkout.expiresAt) - Date.now();
    if (delay <= 0) {
      setClock(Date.now());
      return;
    }
    const timeout = setTimeout(() => setClock(Date.now()), delay);
    return () => clearTimeout(timeout);
  }, [checkout]);

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
  const catalogLines = visibleItems.map(item => ({
    currency: item.variant.currency,
    productName: item.product.name,
    quantity: item.quantity,
    unitAmount: item.variant.unitAmount,
    variantId: item.variantId,
    variantLabel: item.variant.label,
  }));
  const orderLines = checkout?.lines ?? catalogLines;
  const total =
    checkout?.totalAmount ??
    orderLines.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
  const currency = checkout?.currency ?? orderLines[0]?.currency ?? 'usd';
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
      const result = await createCheckout(
        {items: checkoutItems, shipping},
        getCheckoutClientToken()
      );
      storeOrderToken(result.orderId, result.orderToken);
      storePendingCheckout({checkout: result, shipping});
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

  const abandonPayment = async () => {
    if (!checkout) return;
    const order = await cancelCheckout(checkout.orderId, checkout.orderToken);
    clearPendingCheckout();
    if (order.status === 'canceled') {
      setCheckout(null);
    } else {
      navigate(`/store/receipt?order=${checkout.orderId}`);
    }
  };

  const cancelWithoutPaymentForm = async () => {
    if (canceling) return;
    setCanceling(true);
    setError(null);
    try {
      await abandonPayment();
    } catch (cancelError) {
      console.error('Failed to cancel checkout:', cancelError);
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Checkout could not be canceled.'
      );
    } finally {
      setCanceling(false);
    }
  };

  const paymentExpired = checkout
    ? Date.parse(checkout.expiresAt) <= clock
    : false;

  if (!checkout && cart.items.length === 0) {
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
            {orderLines.map(item => (
              <SummaryRow key={item.variantId}>
                <span>
                  {item.productName} — {item.variantLabel} × {item.quantity}
                </span>
                <span>
                  {formatMoney(item.unitAmount * item.quantity, item.currency)}
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
          {checkout ? (
            <>
              <SectionTitle>Payment</SectionTitle>
              {storefront?.stripePublishableKey ? (
                <StripePayment
                  checkout={checkout}
                  onCancel={abandonPayment}
                  paymentExpired={paymentExpired}
                  publishableKey={storefront.stripePublishableKey}
                  shipping={shipping}
                  onConfirmed={() => {
                    clearPendingCheckout();
                    navigate(`/store/receipt?order=${checkout.orderId}`);
                  }}
                />
              ) : (
                <>
                  <Status $error>
                    The payment form is unavailable. You can cancel this
                    reservation and try again.
                  </Status>
                  <FormActions>
                    <Button
                      type="button"
                      disabled={canceling}
                      onClick={() => void cancelWithoutPaymentForm()}
                    >
                      {canceling ? 'Canceling…' : 'Cancel checkout'}
                    </Button>
                  </FormActions>
                </>
              )}
              {paymentExpired ? (
                <Status $error>
                  This reservation expired. Cancel it to return to the store.
                </Status>
              ) : (
                <Status>
                  Reserved until{' '}
                  {new Date(checkout.expiresAt).toLocaleTimeString()}.
                </Status>
              )}
            </>
          ) : null}
          {error ? <Status $error>{error}</Status> : null}
        </Section>
      </CheckoutGrid>
    </StoreShell>
  );
});

export default Checkout;
