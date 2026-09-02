import React, {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router';
import {loadOrder} from './api';
import {readOrderToken, useStoreCart} from './cart';
import type {StoreOrderResponse} from './contracts';
import {formatMoney} from './format';
import {
  ActionLink,
  FormActions,
  ReceiptPanel,
  Status,
  StoreHeading,
  StoreShell,
} from './StoreStyles';

const Receipt = React.memo(() => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order') ?? '';
  const orderToken = orderId ? readOrderToken(orderId) : null;
  const cart = useStoreCart();
  const [order, setOrder] = useState<StoreOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId || !orderToken) {
      setError('This order cannot be opened in this browser session.');
      return;
    }
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      try {
        const result = await loadOrder(orderId, orderToken, controller.signal);
        setOrder(result);
        if (result.status === 'paid') cart.clear();
        if (
          result.status === 'awaiting_payment' ||
          result.status === 'creating_payment'
        ) {
          timeout = setTimeout(refresh, 1500);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          console.error('Failed to load order:', loadError);
          setError('The order status could not be loaded.');
        }
      }
    };
    void refresh();
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [cart.clear, orderId, orderToken]);

  return (
    <StoreShell>
      <StoreHeading>order</StoreHeading>
      <ReceiptPanel>
        {order?.status === 'paid' ? (
          <>
            <p>Thank you. Your payment is complete.</p>
            <p>
              Order {order.orderId} ·{' '}
              {formatMoney(order.totalAmount, order.currency)}
            </p>
            <p>A receipt has been sent to the email address on the order.</p>
          </>
        ) : null}
        {order?.status === 'canceled' ? (
          <Status $error>
            This order expired or was canceled. Your card was not charged.
          </Status>
        ) : null}
        {order && order.status !== 'paid' && order.status !== 'canceled' ? (
          <Status>Payment received. Confirming your order…</Status>
        ) : null}
        {!order && !error ? <Status>Loading your order…</Status> : null}
        {error ? <Status $error>{error}</Status> : null}
      </ReceiptPanel>
      <FormActions>
        <ActionLink to="/store">Back to store</ActionLink>
      </FormActions>
    </StoreShell>
  );
});

export default Receipt;
