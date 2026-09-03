import type {
  CartItemInput,
  CreateCheckoutRequest,
  ShippingInput,
} from '@devopsrockstars/shared-types';

const STATE_CODES = new Set([
  'AK',
  'AL',
  'AR',
  'AS',
  'AZ',
  'CA',
  'CO',
  'CT',
  'DC',
  'DE',
  'FL',
  'GA',
  'GU',
  'HI',
  'IA',
  'ID',
  'IL',
  'IN',
  'KS',
  'KY',
  'LA',
  'MA',
  'MD',
  'ME',
  'MI',
  'MN',
  'MO',
  'MP',
  'MS',
  'MT',
  'NC',
  'ND',
  'NE',
  'NH',
  'NJ',
  'NM',
  'NV',
  'NY',
  'OH',
  'OK',
  'OR',
  'PA',
  'PR',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VA',
  'VI',
  'VT',
  'WA',
  'WI',
  'WV',
  'WY',
]);

export class CheckoutValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CheckoutValidationError';
    this.code = code;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CheckoutValidationError(
      'invalid_checkout',
      'The checkout details are invalid.'
    );
  }
  return value as Record<string, unknown>;
}

function field(value: Record<string, unknown>, key: string) {
  return Reflect.get(value, key) as unknown;
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  required = true,
  code = 'invalid_shipping'
) {
  if (typeof value !== 'string') {
    throw new CheckoutValidationError(code, `${field} is invalid.`);
  }
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw new CheckoutValidationError(code, `${field} is invalid.`);
  }
  return normalized;
}

function readItems(value: unknown): readonly CartItemInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new CheckoutValidationError(
      'invalid_cart',
      'The cart must contain between 1 and 10 items.'
    );
  }
  const quantities = new Map<string, number>();
  for (const rawItem of value) {
    const item = object(rawItem);
    const variantId = text(
      field(item, 'variantId'),
      'Variant',
      100,
      true,
      'invalid_cart'
    );
    const quantity = field(item, 'quantity');
    if (
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      throw new CheckoutValidationError(
        'invalid_cart',
        'Each cart quantity must be a positive integer.'
      );
    }
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + quantity);
  }
  const items = [...quantities].map(([variantId, quantity]) => {
    if (quantity > 2) {
      throw new CheckoutValidationError(
        'invalid_cart',
        'No more than 2 of one item can be purchased at once.'
      );
    }
    return {variantId, quantity};
  });
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > 2) {
    throw new CheckoutValidationError(
      'invalid_cart',
      'No more than 2 items can be purchased at once.'
    );
  }
  return items;
}

function readShipping(value: unknown): ShippingInput {
  const shipping = object(value);
  const email = text(field(shipping, 'email'), 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new CheckoutValidationError('invalid_shipping', 'Email is invalid.');
  }
  const state = text(field(shipping, 'state'), 'State', 2).toUpperCase();
  if (!STATE_CODES.has(state)) {
    throw new CheckoutValidationError('invalid_shipping', 'State is invalid.');
  }
  const postalCode = text(field(shipping, 'postalCode'), 'ZIP code', 10);
  const addressLine2 = field(shipping, 'addressLine2');
  if (!/^[0-9]{5}(?:-[0-9]{4})?$/u.test(postalCode)) {
    throw new CheckoutValidationError(
      'invalid_shipping',
      'ZIP code is invalid.'
    );
  }
  if (field(shipping, 'country') !== 'US') {
    throw new CheckoutValidationError(
      'invalid_shipping',
      'Shipping is currently available in the United States only.'
    );
  }
  return {
    name: text(field(shipping, 'name'), 'Name', 100),
    email,
    addressLine1: text(field(shipping, 'addressLine1'), 'Address', 100),
    addressLine2:
      addressLine2 === undefined
        ? ''
        : text(addressLine2, 'Address 2', 100, false),
    city: text(field(shipping, 'city'), 'City', 100),
    state,
    postalCode,
    country: 'US',
  };
}

export function validateCheckout(value: unknown): CreateCheckoutRequest {
  const checkout = object(value);
  return {
    items: readItems(field(checkout, 'items')),
    shipping: readShipping(field(checkout, 'shipping')),
  };
}
