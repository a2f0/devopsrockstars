import type {
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  StoreErrorResponse,
  StorefrontResponse,
  StoreOrderResponse,
} from '@devopsrockstars/shared-types';

class StoreApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StoreApiError';
    this.code = code;
  }
}

const PRODUCTION_API_ORIGIN =
  'https://devopsrockstars-store.dansullivan.workers.dev';

function apiUrl(path: string) {
  const hostname = globalThis.location?.hostname;
  return hostname === 'devopsrockstars.com' ||
    hostname === 'www.devopsrockstars.com'
    ? new URL(path, PRODUCTION_API_ORIGIN).href
    : path;
}

async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new StoreApiError('request_failed', 'The store request failed.');
    }
    throw new StoreApiError(
      'invalid_response',
      'The store returned an invalid response.'
    );
  }
  if (!response.ok) {
    const errorBody =
      typeof body === 'object' && body !== null
        ? (body as Partial<StoreErrorResponse>)
        : {};
    throw new StoreApiError(
      errorBody.error?.code ?? 'request_failed',
      errorBody.error?.message ?? 'The store request failed.'
    );
  }
  return body as T;
}

export async function loadStorefront(signal?: AbortSignal) {
  const response = await fetch(
    apiUrl('/api/storefront'),
    signal ? {signal} : {}
  );
  return readResponse<StorefrontResponse>(response);
}

export async function createCheckout(
  request: CreateCheckoutRequest,
  checkoutClientToken: string
) {
  const response = await fetch(apiUrl('/api/checkouts'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Checkout-Client': checkoutClientToken,
    },
    body: JSON.stringify(request),
  });
  return readResponse<CreateCheckoutResponse>(response);
}

export async function loadOrder(
  orderId: string,
  orderToken: string,
  signal?: AbortSignal
) {
  const response = await fetch(
    apiUrl(`/api/orders/${encodeURIComponent(orderId)}`),
    {
      headers: {'X-Order-Token': orderToken},
      ...(signal ? {signal} : {}),
    }
  );
  return readResponse<StoreOrderResponse>(response);
}

export async function cancelCheckout(orderId: string, orderToken: string) {
  const response = await fetch(
    apiUrl(`/api/orders/${encodeURIComponent(orderId)}/cancel`),
    {
      method: 'POST',
      headers: {'X-Order-Token': orderToken},
    }
  );
  return readResponse<StoreOrderResponse>(response);
}
