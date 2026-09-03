import type {
  CartItemInput,
  CreateCheckoutResponse,
  ShippingInput,
} from './contracts';

const CHECKOUT_CLIENT_KEY = 'devopsrockstars.store.checkout-client';
const PENDING_CHECKOUT_KEY = 'devopsrockstars.store.pending-checkout';
const ORDER_TOKEN_PREFIX = 'devopsrockstars.store.order.';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface PendingCheckout {
  readonly checkout: CreateCheckoutResponse;
  readonly items: readonly CartItemInput[];
  readonly shipping: ShippingInput;
}

let memoryCheckoutClientToken: string | null = null;

function storedValue(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeValue(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Keep the current page usable when browser storage is unavailable.
  }
}

function removeValue(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing else can be done when browser storage is unavailable.
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function property(value: unknown, key: string) {
  const valueRecord = record(value);
  return valueRecord ? Reflect.get(valueRecord, key) : undefined;
}

function isCartItem(value: unknown): value is CartItemInput {
  const variantId = property(value, 'variantId');
  const quantity = property(value, 'quantity');
  return (
    typeof variantId === 'string' &&
    Number.isSafeInteger(quantity) &&
    Number(quantity) > 0
  );
}

function isShipping(value: unknown): value is ShippingInput {
  return (
    [
      'name',
      'email',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
    ].every(key => typeof property(value, key) === 'string') &&
    property(value, 'country') === 'US'
  );
}

function isCheckout(value: unknown): value is CreateCheckoutResponse {
  return (
    ['clientSecret', 'currency', 'expiresAt', 'orderId', 'orderToken'].every(
      key => typeof property(value, key) === 'string'
    ) && Number.isSafeInteger(property(value, 'totalAmount'))
  );
}

function isPendingCheckout(value: unknown): value is PendingCheckout {
  const checkout = property(value, 'checkout');
  const items = property(value, 'items');
  return (
    isCheckout(checkout) &&
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(isCartItem) &&
    isShipping(property(value, 'shipping'))
  );
}

export function getCheckoutClientToken() {
  if (memoryCheckoutClientToken) return memoryCheckoutClientToken;
  const stored = storedValue(CHECKOUT_CLIENT_KEY);
  if (stored && UUID_PATTERN.test(stored)) {
    memoryCheckoutClientToken = stored;
    return stored;
  }
  const token = crypto.randomUUID();
  memoryCheckoutClientToken = token;
  storeValue(CHECKOUT_CLIENT_KEY, token);
  return token;
}

export function storePendingCheckout(pending: PendingCheckout) {
  storeValue(PENDING_CHECKOUT_KEY, JSON.stringify(pending));
}

export function readPendingCheckout(): PendingCheckout | null {
  const stored = storedValue(PENDING_CHECKOUT_KEY);
  if (!stored) return null;
  try {
    const pending: unknown = JSON.parse(stored);
    const expiration = isPendingCheckout(pending)
      ? Date.parse(pending.checkout.expiresAt)
      : Number.NaN;
    if (
      !isPendingCheckout(pending) ||
      !Number.isFinite(expiration) ||
      expiration <= Date.now()
    ) {
      removeValue(PENDING_CHECKOUT_KEY);
      return null;
    }
    return pending;
  } catch {
    removeValue(PENDING_CHECKOUT_KEY);
    return null;
  }
}

export function clearPendingCheckout() {
  removeValue(PENDING_CHECKOUT_KEY);
}

export function storeOrderToken(orderId: string, token: string) {
  storeValue(`${ORDER_TOKEN_PREFIX}${orderId}`, token);
}

export function readOrderToken(orderId: string) {
  return storedValue(`${ORDER_TOKEN_PREFIX}${orderId}`);
}
