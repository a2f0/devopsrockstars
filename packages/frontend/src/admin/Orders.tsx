import {
  type AdminOrder,
  type AdminOrderFilter,
  type AdminOrdersResponse,
  adminOrderFilters,
  type StoreOrderStatus,
} from '@devopsrockstars/shared-types';
import React, {useCallback, useEffect, useState} from 'react';
import styled from 'styled-components';
import {formatMoney} from '../store/format';
import {Button, Status} from '../store/StoreStyles';
import {AdminApiError, loadOrders} from './api';
import {
  Badge,
  Code,
  Muted,
  Panel,
  PanelHeader,
  SmallButton,
} from './AdminStyles';
import {errorMessage, formatDate, useAdmin} from './context';

const statusLabels: Record<StoreOrderStatus, string> = {
  paid: 'Paid',
  awaiting_payment: 'Awaiting payment',
  creating_payment: 'Creating payment',
  canceled: 'Canceled',
};

const statusTones: Record<StoreOrderStatus, 'good' | 'warn' | 'muted'> = {
  paid: 'good',
  awaiting_payment: 'warn',
  creating_payment: 'warn',
  canceled: 'muted',
};

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
`;

const FilterButton = styled(SmallButton)<{$selected: boolean}>`
  border-color: ${({$selected}) => ($selected ? 'white' : '#555')};
  background: ${({$selected}) => ($selected ? '#1f1f1f' : '#101010')};
`;

const OrderGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px 24px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const Address = styled.address`
  font-style: normal;
  line-height: 1.5;
  user-select: text;
`;

const Lines = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
  }
`;

const Label = styled.div`
  margin-bottom: 4px;
  color: #888;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

function stripePaymentUrl(paymentIntentId: string) {
  const testMode = globalThis.__SITE_ENVIRONMENT__ === 'staging';
  return `https://dashboard.stripe.com/${testMode ? 'test/' : ''}payments/${encodeURIComponent(paymentIntentId)}`;
}

const OrderCard = ({order}: {order: AdminOrder}) => (
  <Panel aria-label={`Order ${order.id}`}>
    <PanelHeader>
      <div>
        <Badge $tone={statusTones[order.status]}>
          {statusLabels[order.status]}
        </Badge>{' '}
        <span>{formatDate(order.createdAt)}</span>
      </div>
      <strong>{formatMoney(order.totalAmount, order.currency)}</strong>
    </PanelHeader>
    <OrderGrid>
      <div>
        <Label>Ship to</Label>
        <Address>
          {order.shipping.name}
          <br />
          {order.shipping.addressLine1}
          {order.shipping.addressLine2 ? (
            <>
              <br />
              {order.shipping.addressLine2}
            </>
          ) : null}
          <br />
          {order.shipping.city}, {order.shipping.state}{' '}
          {order.shipping.postalCode}
          <br />
          {order.shipping.country}
        </Address>
        <Muted style={{marginTop: 6}}>
          <a href={`mailto:${order.email}`}>{order.email}</a>
        </Muted>
      </div>
      <div>
        <Label>Items</Label>
        <Lines>
          {order.items.map(item => (
            <li key={item.sku}>
              <span>
                {item.quantity} × {item.productName}, size {item.variantLabel}{' '}
                <Code>{item.sku}</Code>
              </span>
              <span>{formatMoney(item.lineTotal, order.currency)}</span>
            </li>
          ))}
        </Lines>
        {order.shippingAmount ? (
          <Muted>
            Shipping {formatMoney(order.shippingAmount, order.currency)}
          </Muted>
        ) : null}
        <Muted style={{marginTop: 8}}>
          Order <Code>{order.id}</Code>
          {order.stripePaymentIntentId ? (
            <>
              <br />
              Payment{' '}
              <a
                href={stripePaymentUrl(order.stripePaymentIntentId)}
                target="_blank"
                rel="noreferrer"
              >
                <Code>{order.stripePaymentIntentId}</Code>
              </a>
            </>
          ) : null}
          {order.paidAt ? (
            <>
              <br />
              Paid {formatDate(order.paidAt)}
            </>
          ) : null}
          {order.canceledAt ? (
            <>
              <br />
              Canceled {formatDate(order.canceledAt)}
            </>
          ) : null}
        </Muted>
      </div>
    </OrderGrid>
  </Panel>
);

const Orders = () => {
  const {guard} = useAdmin();
  const [filter, setFilter] = useState<AdminOrderFilter>('all');
  const [page, setPage] = useState<AdminOrdersResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (selected: AdminOrderFilter, cursor?: string) => {
      setBusy(true);
      setError('');
      try {
        const next = await guard(loadOrders(selected, cursor));
        setPage(previous =>
          cursor && previous
            ? {...next, orders: [...previous.orders, ...next.orders]}
            : next
        );
      } catch (caught) {
        if (!(caught instanceof AdminApiError && caught.status === 401))
          setError(errorMessage(caught));
      } finally {
        setBusy(false);
      }
    },
    [guard]
  );

  useEffect(() => {
    setPage(null);
    void load(filter);
  }, [filter, load]);

  const total = page
    ? Object.values(page.counts).reduce((sum, value) => sum + value, 0)
    : 0;

  return (
    <>
      <Filters role="group" aria-label="Order status">
        {adminOrderFilters.map(option => (
          <FilterButton
            key={option}
            type="button"
            $selected={option === filter}
            aria-pressed={option === filter}
            onClick={() => setFilter(option)}
          >
            {option === 'all' ? 'All' : statusLabels[option]}
            {page ? ` (${option === 'all' ? total : page.counts[option]})` : ''}
          </FilterButton>
        ))}
      </Filters>
      {error ? (
        <Status $error role="alert">
          {error}
        </Status>
      ) : null}
      {page ? (
        page.orders.length ? (
          page.orders.map(order => <OrderCard key={order.id} order={order} />)
        ) : (
          <p>No orders{filter === 'all' ? '' : ' with this status'} yet.</p>
        )
      ) : error ? null : (
        <p role="status">Loading orders…</p>
      )}
      {page?.nextCursor ? (
        <Button
          type="button"
          disabled={busy}
          onClick={() => void load(filter, page.nextCursor ?? undefined)}
        >
          {busy ? 'Loading…' : 'Load more orders'}
        </Button>
      ) : null}
    </>
  );
};

export default Orders;
