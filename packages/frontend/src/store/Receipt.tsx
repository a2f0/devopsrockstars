import React, {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router';
import {loadOrder} from './api';
import {useStoreCart} from './cart';
import type {StoreOrderResponse} from '@devopsrockstars/shared-types';
import {formatMoney} from './format';
import {
  ActionLink,
  FormActions,
  ReceiptPanel,
  Status,
  StoreHeading,
  StoreShell,
} from './StoreStyles';
import {clearPendingCheckout, readOrderToken} from './storage';

const Receipt = React.memo(() => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order') ?? '';
  const redirectStatus = searchParams.get('redirect_status');
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
        if (result.status === 'paid') {
          cart.clear();
          clearPendingCheckout();
        }
        if (result.status === 'canceled') clearPendingCheckout();
        if (
          result.status === 'awaiting_payment' ||
          result.status === 'creating_payment'
        ) {
          if (Date.parse(result.expiresAt) + 2 * 60_000 > Date.now()) {
            timeout = setTimeout(refresh, 1500);
          } else {
            setError('This order expired before payment was confirmed.');
          }
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
          <Status $error={redirectStatus === 'failed'}>
            {redirectStatus === 'failed'
              ? 'Payment was not completed. Please try again.'
              : 'Confirming your payment…'}
          </Status>
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
