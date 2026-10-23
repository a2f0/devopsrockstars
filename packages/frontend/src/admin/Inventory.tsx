import type {
  AdminInventoryResponse,
  AdminProduct,
  AdminVariant,
  AdminVariantUpdateRequest,
} from '@devopsrockstars/shared-types';
import React, {type FormEvent, useCallback, useEffect, useState} from 'react';
import styled from 'styled-components';
import {features} from '../featureFlags';
import {formatMoney} from '../store/format';
import {Input, Status} from '../store/StoreStyles';
import {
  AdminApiError,
  loadInventory,
  updateProduct,
  updateVariant,
} from './api';
import {
  Badge,
  Code,
  LinkButton,
  Muted,
  Panel,
  PanelHeader,
  PanelTitle,
  SmallButton,
} from './AdminStyles';
import {errorMessage, useAdmin} from './context';

const columns =
  'minmax(110px, 1.3fr) minmax(90px, 1fr) minmax(80px, 0.9fr) 70px 55px 70px 72px';

const HeaderRow = styled.div`
  display: grid;
  grid-template-columns: ${columns};
  gap: 10px;
  padding: 0 0 6px;
  border-bottom: 1px solid #333;
  color: #888;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  @media (max-width: 720px) {
    display: none;
  }
`;

const VariantForm = styled.form`
  display: grid;
  grid-template-columns: ${columns};
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #222;

  @media (max-width: 720px) {
    grid-template-columns: 1fr 1fr;
    padding: 12px 0;
  }
`;

const Cell = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

// Column headings repeat inside each cell where the header row is hidden.
const CellLabel = styled.span`
  display: none;
  color: #888;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  @media (max-width: 720px) {
    display: block;
  }
`;

const CompactInput = styled(Input)`
  min-height: 38px;
  padding: 6px 8px;
  font-size: 15px;
`;

const Checkbox = styled.input`
  width: 22px;
  height: 22px;
  margin: 8px 0;
  accent-color: white;
`;

const Totals = styled(Muted)`
  margin-top: 10px;
`;

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseCents(value: string) {
  const match = /^\s*\$?(\d{1,6})(?:\.(\d{1,2}))?\s*$/u.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function parseQuantity(value: string) {
  return /^\s*\d{1,6}\s*$/u.test(value) ? Number(value) : null;
}

const VariantRow = ({
  variant,
  onSaved,
}: {
  variant: AdminVariant;
  onSaved: (inventory: AdminInventoryResponse) => void;
}) => {
  const {guard} = useAdmin();
  const [quantity, setQuantity] = useState(String(variant.inventoryQuantity));
  const [price, setPrice] = useState(dollars(variant.unitAmount));
  const [active, setActive] = useState(variant.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset the draft only when this variant's saved values change, so saving
  // one row keeps unsaved edits in the others.
  useEffect(() => {
    setQuantity(String(variant.inventoryQuantity));
    setPrice(dollars(variant.unitAmount));
    setActive(variant.active);
  }, [variant.inventoryQuantity, variant.unitAmount, variant.active]);

  const nextQuantity = parseQuantity(quantity);
  const nextAmount = parseCents(price);
  const dirty =
    nextQuantity !== variant.inventoryQuantity ||
    nextAmount !== variant.unitAmount ||
    active !== variant.active;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nextQuantity === null || nextQuantity > 100_000) {
      setError('Enter a whole-number quantity up to 100,000.');
      return;
    }
    if (nextAmount === null || nextAmount < 50) {
      setError('Enter a price of at least $0.50.');
      return;
    }
    const update: AdminVariantUpdateRequest = {
      ...(nextQuantity === variant.inventoryQuantity
        ? {}
        : {
            expectedInventoryQuantity: variant.inventoryQuantity,
            inventoryQuantity: nextQuantity,
          }),
      ...(nextAmount === variant.unitAmount ? {} : {unitAmount: nextAmount}),
      ...(active === variant.active ? {} : {active}),
    };
    setBusy(true);
    setError('');
    try {
      onSaved(await guard(updateVariant(variant.id, update)));
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 409) {
        // Show the current quantity so the administrator can decide again.
        setError(caught.message);
        void guard(loadInventory())
          .then(onSaved)
          .catch(() => {});
      } else if (!(caught instanceof AdminApiError && caught.status === 401)) {
        setError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <VariantForm
        aria-label={`Size ${variant.label}`}
        onSubmit={save}
        data-testid={`variant-${variant.id}`}
      >
        <Cell>
          <CellLabel>Size</CellLabel>
          <span>{variant.label}</span>
          <Code>{variant.sku}</Code>
        </Cell>
        <Cell>
          <CellLabel>Price ({variant.currency.toUpperCase()})</CellLabel>
          <CompactInput
            aria-label={`Price for size ${variant.label}`}
            name="price"
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={event => setPrice(event.target.value)}
          />
        </Cell>
        <Cell>
          <CellLabel>Available</CellLabel>
          <CompactInput
            aria-label={`Available stock for size ${variant.label}`}
            name="available"
            inputMode="numeric"
            autoComplete="off"
            value={quantity}
            onChange={event => setQuantity(event.target.value)}
          />
        </Cell>
        <Cell>
          <CellLabel>Reserved</CellLabel>
          <span title="Held by checkouts in progress">
            {variant.reservedQuantity}
          </span>
        </Cell>
        <Cell>
          <CellLabel>Sold</CellLabel>
          <span>{variant.soldQuantity}</span>
        </Cell>
        <Cell>
          <CellLabel>For sale</CellLabel>
          <Checkbox
            type="checkbox"
            aria-label={`Offer size ${variant.label}`}
            checked={active}
            onChange={event => setActive(event.target.checked)}
          />
        </Cell>
        <Cell>
          <SmallButton type="submit" disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save'}
          </SmallButton>
        </Cell>
      </VariantForm>
      {error ? (
        <Status $error role="alert">
          {error}
        </Status>
      ) : null}
    </>
  );
};

const ProductPanel = ({
  product,
  onSaved,
}: {
  product: AdminProduct;
  onSaved: (inventory: AdminInventoryResponse) => void;
}) => {
  const {guard} = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = (
    key: 'inventoryQuantity' | 'reservedQuantity' | 'soldQuantity'
  ) => product.variants.reduce((sum, variant) => sum + variant[key], 0);
  const prices = new Set(
    product.variants.map(variant =>
      formatMoney(variant.unitAmount, variant.currency)
    )
  );

  async function toggle() {
    const next = !product.active;
    if (
      !window.confirm(
        next
          ? `Show ${product.name} in the store?`
          : `Hide ${product.name} from the store? Customers will no longer see it.`
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      onSaved(await guard(updateProduct(product.id, {active: next})));
    } catch (caught) {
      if (!(caught instanceof AdminApiError && caught.status === 401))
        setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel aria-label={product.name}>
      <PanelHeader>
        <div>
          <PanelTitle>
            {product.name}{' '}
            <Badge $tone={product.active ? 'good' : 'muted'}>
              {product.active ? 'Listed' : 'Hidden'}
            </Badge>
          </PanelTitle>
          <Muted>
            {product.manufacturer} · {[...prices].join(', ')} ·{' '}
            <Code>{product.slug}</Code>
          </Muted>
        </div>
        <LinkButton type="button" onClick={toggle} disabled={busy}>
          {product.active ? 'Hide from store' : 'Show in store'}
        </LinkButton>
      </PanelHeader>
      {error ? (
        <Status $error role="alert">
          {error}
        </Status>
      ) : null}
      <HeaderRow aria-hidden="true">
        <span>Size</span>
        <span>Price</span>
        <span>Available</span>
        <span>Reserved</span>
        <span>Sold</span>
        <span>For sale</span>
        <span />
      </HeaderRow>
      {product.variants.map(variant => (
        <VariantRow key={variant.id} variant={variant} onSaved={onSaved} />
      ))}
      <Totals>
        {total('inventoryQuantity')} available · {total('reservedQuantity')}{' '}
        reserved · {total('soldQuantity')} sold
      </Totals>
    </Panel>
  );
};

const Inventory = () => {
  const {guard} = useAdmin();
  const [inventory, setInventory] = useState<AdminInventoryResponse | null>(
    null
  );
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setError('');
    guard(loadInventory())
      .then(setInventory)
      .catch(caught => {
        if (!(caught instanceof AdminApiError && caught.status === 401))
          setError(errorMessage(caught));
      });
  }, [guard]);

  useEffect(refresh, [refresh]);

  return (
    <>
      <Muted style={{marginBottom: 16}}>
        Available stock excludes units held by checkouts in progress; abandoned
        checkouts return their units within ten minutes.
        {features.store
          ? null
          : ' The store is turned off in this environment, so customers cannot see these products yet.'}
      </Muted>
      {error ? (
        <Status $error role="alert">
          {error}{' '}
          <LinkButton type="button" onClick={refresh}>
            Retry
          </LinkButton>
        </Status>
      ) : null}
      {inventory ? (
        inventory.products.length ? (
          inventory.products.map(product => (
            <ProductPanel
              key={product.id}
              product={product}
              onSaved={setInventory}
            />
          ))
        ) : (
          <p>No products yet.</p>
        )
      ) : error ? null : (
        <p role="status">Loading inventory…</p>
      )}
    </>
  );
};

export default Inventory;
